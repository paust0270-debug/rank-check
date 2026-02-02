# 순위 체크 APK - Turafic API 명세서

**버전**: 1.0
**작성일**: 2025-11-20
**Base URL**: `http://localhost:5000/trpc`

---

## 개요

이 문서는 네이버 순위 체크 Android APK가 Turafic 서버와 통신하기 위한 API 명세를 정의합니다.

Turafic 서버는 **tRPC**를 사용하므로, HTTP 요청 형식이 일반적인 REST API와 다릅니다.

---

## tRPC 호출 방식

### 1. Query (조회)
```
GET /trpc/{procedureName}?input={JSON}
```

### 2. Mutation (변경)
```
POST /trpc/{procedureName}
Content-Type: application/json

{
  "input": { ... }
}
```

---

## API 목록

### 1. 봇 등록

**Endpoint**: `/trpc/rankCheck.registerBot`
**Method**: POST
**설명**: 새로운 봇을 시스템에 등록합니다.

**Request Body**:
```json
{
  "deviceId": "android-device-12345",
  "deviceModel": "Samsung Galaxy S21"
}
```

**Response**:
```json
{
  "result": {
    "data": {
      "success": true,
      "botId": 1
    }
  }
}
```

**Android (Kotlin) 예시**:
```kotlin
val response = httpClient.post("$baseUrl/trpc/rankCheck.registerBot") {
    contentType(ContentType.Application.Json)
    setBody(mapOf(
        "deviceId" to "android-device-12345",
        "deviceModel" to "Samsung Galaxy S21"
    ))
}
val botId = response.body<TrpcResponse>().result.data.botId
```

---

### 2. 작업 요청

**Endpoint**: `/trpc/rankCheck.getTask`
**Method**: GET
**설명**: 서버로부터 순위 체크 작업을 요청합니다.

**Query Parameters**:
```
input={"botId":1,"loginId":"test_user","imei":"123456789012345"}
```

**Response (작업 있음)**:
```json
{
  "result": {
    "data": {
      "success": true,
      "task": {
        "taskId": "task_896912_1700123456789",
        "campaignId": 896912,
        "keyword": "자전거 장갑",
        "productId": "48270522934",
        "platform": "naver",
        "variables": {
          "userAgent": "Mozilla/5.0 (Linux; Android 8.0.0; SM-G930K Build/R16NW; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.82 Mobile Safari/537.36",
          "cookieStrategy": "nologin",
          "referer": "https://msearch.shopping.naver.com/",
          "secFetchSite": "same-site",
          "cookies": {
            "NNB": "IJETDRGUTUMGS"
          }
        }
      }
    }
  }
}
```

**Response (작업 없음)**:
```json
{
  "result": {
    "data": {
      "success": false,
      "message": "No tasks available"
    }
  }
}
```

**Android (Kotlin) 예시**:
```kotlin
val input = URLEncoder.encode(
    """{"botId":1,"loginId":"test_user","imei":"123456789012345"}""",
    "UTF-8"
)
val response = httpClient.get("$baseUrl/trpc/rankCheck.getTask?input=$input")
val task = response.body<TrpcResponse>().result.data.task
```

---

### 3. 순위 보고

**Endpoint**: `/trpc/rankCheck.reportRank`
**Method**: POST
**설명**: 순위 체크 결과를 서버에 보고합니다.

**Request Body**:
```json
{
  "taskId": "task_896912_1700123456789",
  "campaignId": 896912,
  "rank": 45,
  "timestamp": "2025-11-20T10:30:00Z",
  "success": true
}
```

**Response**:
```json
{
  "result": {
    "data": {
      "success": true
    }
  }
}
```

**Android (Kotlin) 예시**:
```kotlin
val response = httpClient.post("$baseUrl/trpc/rankCheck.reportRank") {
    contentType(ContentType.Application.Json)
    setBody(mapOf(
        "taskId" to "task_896912_1700123456789",
        "campaignId" to 896912,
        "rank" to 45,
        "timestamp" to Instant.now().toString(),
        "success" to true
    ))
}
```

**순위 못 찾음 (rank = -1)**:
```json
{
  "taskId": "task_896912_1700123456789",
  "campaignId": 896912,
  "rank": -1,
  "timestamp": "2025-11-20T10:30:00Z",
  "success": false,
  "errorMessage": "Product not found in top 400 results"
}
```

---

### 4. 작업 완료

**Endpoint**: `/trpc/rankCheck.finishTask`
**Method**: POST
**설명**: 작업 완료를 서버에 알립니다.

**Request Body**:
```json
{
  "taskId": "task_896912_1700123456789",
  "botId": 1
}
```

**Response**:
```json
{
  "result": {
    "data": {
      "success": true
    }
  }
}
```

**Android (Kotlin) 예시**:
```kotlin
val response = httpClient.post("$baseUrl/trpc/finishTask") {
    contentType(ContentType.Application.Json)
    setBody(mapOf(
        "taskId" to "task_896912_1700123456789",
        "botId" to 1
    ))
}
```

---

### 5. 봇 상태 업데이트

**Endpoint**: `/trpc/rankCheck.updateBotStatus`
**Method**: POST
**설명**: 봇의 상태를 업데이트합니다.

**Request Body**:
```json
{
  "botId": 1,
  "status": "online"
}
```

**status 값**:
- `"online"`: 정상 작동 중
- `"offline"`: 오프라인
- `"error"`: 에러 발생

**Response**:
```json
{
  "result": {
    "data": {
      "success": true
    }
  }
}
```

---

## 전체 워크플로우

```
1. 앱 시작
   ↓
2. registerBot() → botId 획득
   ↓
3. updateBotStatus(online)
   ↓
4. while (true):
     a. getTask() → task 획득
     b. if (task == null) → sleep(60초) → continue
     c. 순위 체크 실행
     d. reportRank(rank)
     e. finishTask()
     f. sleep(10분)
```

---

## Kotlin 전체 예시 코드

```kotlin
class TuraficApiClient(
    private val baseUrl: String = "http://localhost:5000/trpc"
) {
    private val httpClient = HttpClient {
        install(ContentNegotiation) {
            json()
        }
    }

    suspend fun registerBot(deviceId: String, deviceModel: String): Int {
        val response = httpClient.post("$baseUrl/rankCheck.registerBot") {
            contentType(ContentType.Application.Json)
            setBody(mapOf(
                "deviceId" to deviceId,
                "deviceModel" to deviceModel
            ))
        }
        return response.body<TrpcResponse>().result.data.botId
    }

    suspend fun getTask(botId: Int, loginId: String, imei: String): RankCheckTask? {
        val input = URLEncoder.encode(
            """{"botId":$botId,"loginId":"$loginId","imei":"$imei"}""",
            "UTF-8"
        )
        val response = httpClient.get("$baseUrl/rankCheck.getTask?input=$input")
        val data = response.body<TrpcResponse>().result.data
        return if (data.success) data.task else null
    }

    suspend fun reportRank(
        taskId: String,
        campaignId: Int,
        rank: Int,
        success: Boolean,
        errorMessage: String? = null
    ) {
        httpClient.post("$baseUrl/rankCheck.reportRank") {
            contentType(ContentType.Application.Json)
            setBody(mapOf(
                "taskId" to taskId,
                "campaignId" to campaignId,
                "rank" to rank,
                "timestamp" to Instant.now().toString(),
                "success" to success,
                "errorMessage" to errorMessage
            ))
        }
    }

    suspend fun finishTask(taskId: String, botId: Int) {
        httpClient.post("$baseUrl/rankCheck.finishTask") {
            contentType(ContentType.Application.Json)
            setBody(mapOf(
                "taskId" to taskId,
                "botId" to botId
            ))
        }
    }

    suspend fun updateBotStatus(botId: Int, status: String) {
        httpClient.post("$baseUrl/rankCheck.updateBotStatus") {
            contentType(ContentType.Application.Json)
            setBody(mapOf(
                "botId" to botId,
                "status" to status
            ))
        }
    }
}

// 사용 예시
suspend fun main() {
    val client = TuraficApiClient()

    // 1. 봇 등록
    val botId = client.registerBot(
        deviceId = "android-${UUID.randomUUID()}",
        deviceModel = Build.MODEL
    )

    // 2. 상태 업데이트
    client.updateBotStatus(botId, "online")

    // 3. 작업 루프
    while (true) {
        val task = client.getTask(
            botId = botId,
            loginId = "test_user",
            imei = "123456789012345"
        )

        if (task == null) {
            delay(60_000) // 1분 대기
            continue
        }

        // 4. 순위 체크 실행
        val rank = performRankCheck(task)

        // 5. 순위 보고
        client.reportRank(
            taskId = task.taskId,
            campaignId = task.campaignId,
            rank = rank,
            success = rank != -1
        )

        // 6. 작업 완료
        client.finishTask(task.taskId, botId)

        // 10분 대기
        delay(600_000)
    }
}
```

---

## 데이터 모델

### RankCheckTask
```kotlin
data class RankCheckTask(
    val taskId: String,
    val campaignId: Int,
    val keyword: String,
    val productId: String,
    val platform: String, // "naver" or "coupang"
    val variables: TaskVariables
)

data class TaskVariables(
    val userAgent: String,
    val cookieStrategy: String, // "login" or "nologin"
    val referer: String,
    val secFetchSite: String, // "none", "same-site", "same-origin"
    val cookies: Map<String, String>?
)
```

### TrpcResponse
```kotlin
data class TrpcResponse(
    val result: TrpcResult
)

data class TrpcResult(
    val data: TrpcData
)

data class TrpcData(
    val success: Boolean,
    val message: String? = null,
    val botId: Int? = null,
    val task: RankCheckTask? = null
)
```

---

## 에러 처리

### HTTP 에러 코드
- `400`: 잘못된 요청 (필수 파라미터 누락)
- `500`: 서버 내부 오류

### 재시도 로직
```kotlin
suspend fun <T> retryWithExponentialBackoff(
    maxRetries: Int = 3,
    initialDelayMillis: Long = 1000,
    block: suspend () -> T
): T? {
    var currentDelay = initialDelayMillis
    repeat(maxRetries) { attempt ->
        try {
            return block()
        } catch (e: Exception) {
            if (attempt == maxRetries - 1) throw e
            delay(currentDelay)
            currentDelay *= 2
        }
    }
    return null
}

// 사용 예시
val task = retryWithExponentialBackoff {
    client.getTask(botId, loginId, imei)
}
```

---

## 테스트

### Postman / cURL 테스트

**1. 봇 등록**:
```bash
curl -X POST http://localhost:5000/trpc/rankCheck.registerBot \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"test-device-1","deviceModel":"Test Device"}'
```

**2. 작업 요청**:
```bash
curl "http://localhost:5000/trpc/rankCheck.getTask?input=%7B%22botId%22%3A1%2C%22loginId%22%3A%22test%22%2C%22imei%22%3A%22123%22%7D"
```

**3. 순위 보고**:
```bash
curl -X POST http://localhost:5000/trpc/rankCheck.reportRank \
  -H "Content-Type: application/json" \
  -d '{"taskId":"test_123","campaignId":1,"rank":45,"timestamp":"2025-11-20T10:00:00Z","success":true}'
```

---

## 참고 문서

- [PRD: NAVER_RANK_CHECKER_PRD.md](../NAVER_RANK_CHECKER_PRD.md)
- [서비스 구현: rankCheckService.ts](../../server/services/rankCheckService.ts)
- [라우터: server/routers.ts](../../server/routers.ts)

---

**문서 끝**
