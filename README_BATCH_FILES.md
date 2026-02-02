# 배치 파일 사용 가이드

프로젝트 루트에 있는 배치 파일들의 사용법입니다.

## 📋 배치 파일 목록

### 1. `setup.bat` - 초기 설정
프로그램을 처음 실행하기 전에 필요한 설정을 수행합니다.

**기능:**
- Node.js 및 npm 버전 확인
- .env 파일 생성 (batch-scripts/create-env.ps1 사용)
- 의존성 패키지 설치 (npm install)

**사용법:**
```batch
setup.bat
```

---

### 2. `start.bat` - 자동 업데이트 모드 실행
작업 큐를 감시하며 자동으로 순위를 체크합니다.

**기능:**
- `keywords_navershopping` 테이블 감시
- 작업이 있으면 즉시 처리
- 작업이 없으면 1분 대기 후 재확인
- 18분마다 Git 업데이트 확인

**사용법:**
```batch
start.bat
```

**종료:** Ctrl+C

---

### 3. `run-rank-check.bat` - 순위 체크 실행
한 번만 순위 체크를 실행합니다.

**기능:**
- 배치 순위 체크 실행
- 로그 파일 자동 생성 (batch-scripts/logs/)
- 타임스탬프가 포함된 로그 파일명

**사용법:**
```batch
run-rank-check.bat
```

**로그 위치:** `batch-scripts/logs/rank-check-YYYYMMDD-HHMM.log`

---

### 4. `test-connection.bat` - 연결 테스트
Supabase 데이터베이스 연결을 테스트합니다.

**기능:**
- Supabase 연결 확인
- 테이블 상태 확인

**사용법:**
```batch
test-connection.bat
```

---

## 🚀 빠른 시작

1. **초기 설정**
   ```batch
   setup.bat
   ```

2. **.env 파일 설정**
   - `.env` 파일을 열어서 Supabase URL과 키를 입력하세요

3. **프로그램 실행**
   ```batch
   start.bat
   ```

---

## 📁 관련 폴더

- `batch-scripts/` - 추가 배치 스크립트들
- `rank-check/` - 순위 체크 관련 코드
- `logs/` - 로그 파일 저장 위치

---

## ⚠️ 주의사항

1. **Node.js 필수**: Node.js가 설치되어 있어야 합니다
2. **.env 파일**: Supabase 설정이 필요합니다
3. **의존성 설치**: `setup.bat`을 실행하면 자동으로 설치됩니다

---

## 🔧 문제 해결

### Node.js가 없다는 오류
- Node.js를 설치하세요: https://nodejs.org/

### .env 파일이 없다는 오류
- `setup.bat`을 실행하세요
- 또는 `batch-scripts/create-env.ps1`을 수동으로 실행하세요

### 패키지 설치 실패
- 인터넷 연결을 확인하세요
- `npm install`을 수동으로 실행해보세요


