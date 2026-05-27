require('dotenv').config();
const express = require('express');
const { getMessageDetails, sendMessage, sendCard, buildFaqCard } = require('./webex');
const db = require('./db');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

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
      if (message.personId === actorId) return;

      const text = (message.text || '').trim();
      const roomId = message.roomId;
      const personId = message.personId;

      // 등록 세션 진행 중이면 value 입력으로 처리
      if (registerSessions.has(personId)) {
        await handleRegisterValue(personId, text, roomId);
        return;
      }

      if (text.startsWith('/등록')) {
        await handleRegisterCommand(personId, text, roomId);
      } else if (text === '/답변') {
        await handleReplyCommand(roomId);
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

async function handleReplyCommand(roomId) {
  const faqs = db.getAll();
  if (faqs.length === 0) {
    await sendMessage(roomId, '등록된 답변이 없습니다. /등록 [키] 로 먼저 등록해주세요.');
    return;
  }

  const card = buildFaqCard(faqs);
  await sendCard(roomId, card);
}

async function handleListCommand(roomId) {
  const faqs = db.getAll();
  if (faqs.length === 0) {
    await sendMessage(roomId, '등록된 답변이 없습니다.');
    return;
  }

  const list = faqs.map((f) => `• ${f.key}: ${f.value}`).join('\n');
  await sendMessage(roomId, `등록된 답변 목록:\n${list}`);
}

async function handleDeleteCommand(text, roomId) {
  const key = text.replace('/삭제 ', '').trim();
  const deleted = db.remove(key);
  if (deleted) {
    await sendMessage(roomId, `"${key}" 답변이 삭제되었습니다.`);
  } else {
    await sendMessage(roomId, `"${key}"에 해당하는 답변이 없습니다.`);
  }
}

async function handleCardAction(data, actorId) {
  // attachmentActions 데이터에서 입력값과 roomId 가져오기
  const axios = require('axios');
  const res = await axios.get(`https://webexapis.com/v1/attachment/actions/${data.id}`, {
    headers: {
      Authorization: `Bearer ${process.env.WEBEX_BOT_TOKEN}`,
    },
  });

  const { inputs, roomId } = res.data;

  if (inputs.action !== 'sendFaq') return;

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

  await sendMessage(roomId, faq.value);
}

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
