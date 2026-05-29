require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { getMessageDetails, sendMessage, sendCard, buildFaqCard } = require('./webex');
const db = require('./db');
const { createEmbedding, cosineSimilarity, getEmbeddingInput } = require('./embedding');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

let BOT_PERSON_ID = null;
let BOT_DISPLAY_NAME = null;
axios.get('https://webexapis.com/v1/people/me', {
  headers: { Authorization: `Bearer ${process.env.WEBEX_BOT_TOKEN}` },
}).then(res => {
  BOT_PERSON_ID = res.data.id;
  BOT_DISPLAY_NAME = res.data.displayName;
  console.log(`봇 ID 로드됨: ${BOT_PERSON_ID}`);
});

// 등록 진행 중인 답변자 상태 관리 (key 입력 대기 → value 입력 대기)
// Map<personId, { step: 'awaitingValue', key: string, roomId: string }>
const registerSessions = new Map();

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const { resource, event, data, actorId } = req.body;

  try {
    // attachmentActions 이벤트: 카드 버튼 클릭
    if (resource === 'attachmentActions' && event === 'created') {
      await handleCardAction(data, actorId);
      return;
    }

    // messages 이벤트: 텍스트 메시지
    if (resource === 'messages' && event === 'created') {
      const message = await getMessageDetails(data.id);

      // 봇 자신의 메시지는 무시
      if (message.personId === BOT_PERSON_ID) return;

      // 스페이스에서 @멘션 시 앞에 봇 이름이 붙어서 옴 → 봇 이름 제거
      const raw = (message.text || '').trim();
      const text = (BOT_DISPLAY_NAME && raw.startsWith(BOT_DISPLAY_NAME))
        ? raw.slice(BOT_DISPLAY_NAME.length).trim()
        : raw;
      const roomId = message.roomId;
      const personId = message.personId;

      // 등록 세션 진행 중이면 value 입력으로 처리
      if (registerSessions.has(personId)) {
        await handleRegisterValue(personId, text, roomId);
        return;
      }

      if (/^(help|h|도움말|사용법)$/i.test(text)) {
        await handleHelpCommand(roomId);
      } else if (text.startsWith('/등록')) {
        await handleRegisterCommand(personId, text, roomId);
      } else if (text.startsWith('/답변')) {
        await handleReplyCommand(personId, text, roomId);
      } else if (text.startsWith('/질문')) {
        await handleQuestionCommand(text, roomId);
      } else if (text === '/목록') {
        await handleListCommand(roomId);
      } else if (text.startsWith('/삭제 ')) {
        await handleDeleteCommand(text, roomId);
      }
    }
  } catch (err) {
    console.error('webhook 처리 오류:', err.message, err.response?.data ?? '');
  }
});

async function handleHelpCommand(roomId) {
  const message = [
    '사용 가능한 명령어 목록:',
    '',
    '/등록 [키] — 새 답변 등록 (키 입력 후 내용 입력)',
    '/답변 [키] — 키에 해당하는 답변 조회',
    '/질문 [질문] — 유사한 답변 검색 (기본 3개)',
    '/질문 [n] [질문] — 유사한 답변 n개 검색',
    '/목록 — 등록된 전체 답변 키 목록 조회',
    '/삭제 [키 또는 ID] — 답변 삭제',
    '',
    'help / h / 도움말 / 사용법 — 이 도움말 표시',
  ].join('\n');
  await sendMessage(roomId, message);
}

async function handleRegisterCommand(personId, text, roomId) {
  // /등록 [키] 형식 파싱
  const parts = text.split(/\s+/);
  if (parts.length < 2) {
    await sendMessage(roomId, '사용법: /등록 [키]\n예) /등록 제출마감');
    return;
  }

  const key = parts.slice(1).join(' ');
  registerSessions.set(personId, { key, roomId });
  await sendMessage(roomId, `"${key}"에 등록할 답변 내용을 입력하세요.`);
}

async function handleRegisterValue(personId, text, roomId) {
  const session = registerSessions.get(personId);
  registerSessions.delete(personId);

  const faq = await db.upsert(session.key, text);

  try {
    const embedding = await createEmbedding(getEmbeddingInput(faq));
    await db.upsertEmbedding(faq.key, embedding);
    await sendMessage(roomId, `"${session.key}" 답변이 등록되었습니다.`);
  } catch (err) {
    console.error('임베딩 생성 오류:', err.message);
    await sendMessage(roomId, `"${session.key}" 답변이 등록되었습니다.\n단, 임베딩 생성에 실패해 /질문 검색에는 아직 반영되지 않았습니다.`);
  }
}

async function handleReplyCommand(personId, text, roomId) {
  const parts = text.split(/\s+/);
  if (parts.length < 2) {
    await sendMessage(roomId, '사용법: /답변 [키]\n예) /답변 제출마감');
    return;
  }

  const key = parts.slice(1).join(' ');
  const faq = await db.getByKey(key);
  if (!faq) {
    await sendMessage(roomId, `"${key}"에 해당하는 답변이 없습니다.`);
    return;
  }

  await sendMessage(roomId, faq.value);
}

function parseQuestionCommand(text) {
  const body = text.replace('/질문', '').trim();
  const match = body.match(/^(\d+)\s+(.+)$/);

  if (!match) {
    return {
      question: body,
      topK: Number(process.env.QUESTION_TOP_K || 3),
    };
  }

  return {
    question: match[2].trim(),
    topK: Number(match[1]),
  };
}

async function ensureEmbeddings(faqs) {
  for (const faq of faqs) {
    if (faq.embedding) continue;

    const embedding = await createEmbedding(getEmbeddingInput(faq));
    await db.upsertEmbedding(faq.key, embedding);
    faq.embedding = embedding;
  }
}

async function handleQuestionCommand(text, roomId) {
  const { question, topK } = parseQuestionCommand(text);
  if (!question) {
    await sendMessage(roomId, '사용법: /질문 [질문]\n예) /질문 프로젝트 제출 마감이 언제인가요?');
    return;
  }

  const faqs = await db.getAllForSearch();
  if (faqs.length === 0) {
    await sendMessage(roomId, '등록된 답변이 없습니다.');
    return;
  }

  try {
    await ensureEmbeddings(faqs);
    const questionEmbedding = await createEmbedding(question);
    const limit = Number.isInteger(topK) && topK > 0 ? Math.min(topK, 10) : 3;

    const results = faqs
      .map((faq) => ({
        ...faq,
        score: cosineSimilarity(questionEmbedding, faq.embedding),
      }))
      .filter((faq) => Number.isFinite(faq.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (results.length === 0) {
      await sendMessage(roomId, '유사도를 계산할 수 있는 답변이 없습니다.');
      return;
    }

    const lines = results.map((faq, index) => {
      const score = faq.score.toFixed(4);
      return `${index + 1}. [${faq.key}] 유사도 ${score}\n${faq.value}`;
    });

    await sendMessage(roomId, `질문: ${question}\n\n가장 유사한 답변 ${results.length}개:\n\n${lines.join('\n\n')}`);
  } catch (err) {
    console.error('질문 검색 오류:', err.message);
    await sendMessage(roomId, '질문 검색 중 오류가 발생했습니다. OPENAI_API_KEY 설정과 서버 로그를 확인해주세요.');
  }
}

async function handleListCommand(roomId) {
  const faqs = await db.getAll();
  if (faqs.length === 0) {
    await sendMessage(roomId, '등록된 답변이 없습니다.');
    return;
  }

  const LIMIT = 4000;
  const lines = faqs.map((f) => `[${f.id}] ${f.key}`);

  let chunk = `등록된 답변 목록 (총 ${faqs.length}개):\n`;
  for (const line of lines) {
    if ((chunk + '\n' + line).length > LIMIT) {
      await sendMessage(roomId, chunk);
      chunk = line;
    } else {
      chunk += '\n' + line;
    }
  }
  if (chunk) await sendMessage(roomId, chunk);
}

async function handleDeleteCommand(text, roomId) {
  const target = text.replace('/삭제 ', '').trim();
  const isId = /^\d+$/.test(target);

  const deleted = isId ? await db.removeById(Number(target)) : await db.remove(target);
  if (deleted) {
    await sendMessage(roomId, `"${target}" 답변이 삭제되었습니다.`);
  } else {
    await sendMessage(roomId, `"${target}"에 해당하는 답변이 없습니다.`);
  }
}

async function handleCardAction(data, actorId) {
  console.log('[DEBUG] handleCardAction 진입, data.id:', data.id);
  const axios = require('axios');
  const res = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, {
    headers: {
      Authorization: `Bearer ${process.env.WEBEX_BOT_TOKEN}`,
    },
  });

  const { inputs, roomId } = res.data;

  if (!inputs) return;

  const selectedKey = inputs.selectedKey;
  if (!selectedKey) {
    await sendMessage(roomId, '답변을 선택해주세요.');
    return;
  }

  const faq = await db.getByKey(selectedKey);
  if (!faq) {
    await sendMessage(roomId, `"${selectedKey}"에 해당하는 답변을 찾을 수 없습니다.`);
    return;
  }

  // 답변을 전송하지 않고 복사할 수 있도록 텍스트만 보여줌
  await sendMessage(roomId, `📋 [${selectedKey}] 답변 내용 (복사해서 사용하세요)\n\n${faq.value}`);
}

app.post('/admin/faq/bulk', async (req, res) => {
  const items = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'body는 [{ key, value }, ...] 형식의 배열이어야 합니다.' });
  }

  const invalid = items.find((item) => !item.key || !item.value);
  if (invalid) {
    return res.status(400).json({ error: '각 항목에 key와 value가 필요합니다.' });
  }

  for (const { key, value } of items) {
    await db.upsert(key, value);
  }

  res.json({ inserted: items.length });
});

app.get('/', (req, res) => res.sendStatus(200));

async function start() {
  await db.init();
  app.listen(PORT, () => {
    console.log(`서버 실행 중: http://localhost:${PORT}`);
  });
}

start();
