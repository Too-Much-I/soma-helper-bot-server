# SOMA Helper Bot Server

Webex 스페이스에서 자주 묻는 질문(FAQ)을 등록하고, 원클릭으로 답변을 전송할 수 있는 봇 서버입니다.

## 기능

- FAQ를 키-값(질문-답변) 형태로 SQLite에 저장
- 중복되는 질문, 반복되는 답변에 활용 가능
- FAQ 등록 / 수정 / 삭제 / 목록 조회 지원

## 봇 사용법
#### 1. 봇 찾기
- Webex에서 soma_helper@webex.bot 을 검색해 봇을 찾아주세요.
#### 2. 사용 방법
봇을 사용하는 방법은 두 가지입니다.

- DM으로 사용하기 — 봇과 1:1 대화창을 열어 명령어를 바로 입력하세요.
- 스페이스(대화방)에서 사용하기 — 봇을 스페이스 멤버로 초대한 후, @soma_helper 멘션과 함께 명령어를 입력하세요.

지원되는 명령어는 아래와 같습니다. 
### FAQ 등록 / 수정

```
/등록 [키]
```

명령어 입력 후, 봇이 답변 내용을 묻는 메시지를 보내면 내용을 입력합니다.  
이미 존재하는 키면 덮어씁니다(수정).

**예시:**
```
/등록 제출마감

(봇) "제출마감"에 등록할 답변 내용을 입력하세요.

(사용자) 제출 마감은 매주 금요일 오후 6시입니다.
```

<img width="1526" height="982" alt="image" src="https://github.com/user-attachments/assets/f4bfeb93-ba58-4035-982e-c7fdd2255c8b" />

---

### 특정 답변 확인

```
/답변 키
```
<img width="1518" height="600" alt="image" src="https://github.com/user-attachments/assets/6baaad1b-1ccc-4fbb-af77-b2ebd398b1c1" />


---

### 등록된 FAQ 목록 조회

```
/목록
```

현재 등록된 모든 키-답변 쌍을 텍스트로 출력합니다.

<img width="1466" height="334" alt="image" src="https://github.com/user-attachments/assets/21036f8a-4b0f-43f0-a73e-3ac819191499" />


---

### FAQ 삭제

삭제는 등록한 키 혹은 id로 모두 가능합니다. 
```
/삭제 [키]
/삭제 [id]
```

**예시:**

```
/삭제 제출마감
```

<img width="1440" height="240" alt="image" src="https://github.com/user-attachments/assets/18578feb-15b7-49fc-9071-a3c25c0bdb48" />


