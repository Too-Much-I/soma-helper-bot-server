require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { getMessageDetails, sendMessage, sendCard, buildFaqCard } = require('./webex');
const db = require('./db');

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

      if (text.startsWith('/등록')) {
        await handleRegisterCommand(personId, text, roomId);
      } else if (text.startsWith('/답변')) {
        await handleReplyCommand(personId, text, roomId);
      } else if (text === '/목록') {
        await handleListCommand(roomId);
      } else if (text.startsWith('/삭제 ')) {
        await handleDeleteCommand(text, roomId);
      }
    }
  } catch (err) {
    console.error('webhook 처리 오류:', err.message);
  }
});

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

  db.upsert(session.key, text);
  await sendMessage(roomId, `"${session.key}" 답변이 등록되었습니다.`);
}

async function handleReplyCommand(personId, text, roomId) {
  const parts = text.split(/\s+/);
  if (parts.length < 2) {
    await sendMessage(roomId, '사용법: /답변 [키]\n예) /답변 제출마감');
    return;
  }

  const key = parts.slice(1).join(' ');
  const faq = db.getByKey(key);
  if (!faq) {
    await sendMessage(roomId, `"${key}"에 해당하는 답변이 없습니다.`);
    return;
  }

  await sendMessage(roomId, faq.value);
}

async function handleListCommand(roomId) {
  const faqs = db.getAll();
  if (faqs.length === 0) {
    await sendMessage(roomId, '등록된 답변이 없습니다.');
    return;
  }

  const list = faqs.map((f) => `[${f.id}] ${f.key}: ${f.value}`).join('\n');
  await sendMessage(roomId, `등록된 답변 목록:\n${list}`);
}

async function handleDeleteCommand(text, roomId) {
  const target = text.replace('/삭제 ', '').trim();
  const isId = /^\d+$/.test(target);

  const deleted = isId ? db.removeById(Number(target)) : db.remove(target);
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

  const faq = db.getByKey(selectedKey);
  if (!faq) {
    await sendMessage(roomId, `"${selectedKey}"에 해당하는 답변을 찾을 수 없습니다.`);
    return;
  }

  // 답변을 전송하지 않고 복사할 수 있도록 텍스트만 보여줌
  await sendMessage(roomId, `📋 [${selectedKey}] 답변 내용 (복사해서 사용하세요)\n\n${faq.value}`);
}

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
