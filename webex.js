const axios = require('axios');

const BASE_URL = 'https://webexapis.com/v1';

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.WEBEX_BOT_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function getMessageDetails(messageId) {
  const res = await axios.get(`${BASE_URL}/messages/${messageId}`, { headers: getHeaders() });
  return res.data;
}

async function sendMessage(roomId, text) {
  await axios.post(`${BASE_URL}/messages`, { roomId, text }, { headers: getHeaders() });
}

async function sendCard(roomId, card) {
  await axios.post(
    `${BASE_URL}/messages`,
    {
      roomId,
      text: '답변 목록 (카드를 지원하지 않는 클라이언트에서는 이 메시지가 표시됩니다)',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: card,
        },
      ],
    },
    { headers: getHeaders() }
  );
}

function buildFaqCard(faqs) {
  if (faqs.length === 0) {
    return null;
  }

  const choices = faqs.map((faq) => ({
    title: faq.key,
    value: faq.key,
  }));

  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.3',
    body: [
      {
        type: 'TextBlock',
        text: '전송할 답변을 선택하세요',
        weight: 'Bolder',
        size: 'Medium',
      },
      {
        type: 'Input.ChoiceSet',
        id: 'selectedKey',
        style: 'expanded',
        choices,
      },
    ],
    actions: [
      {
        type: 'Action.Submit',
        title: '전송',
        data: { action: 'sendFaq' },
      },
    ],
  };
}

module.exports = { getMessageDetails, sendMessage, sendCard, buildFaqCard };
