# 네이버 순위 체크 Android APK - 개발 가이드

**버전**: 1.0
**작성일**: 2025-11-20
**대상**: Android 개발자

---

## 목차

1. [프로젝트 생성](#1-프로젝트-생성)
2. [의존성 설정](#2-의존성-설정)
3. [프로젝트 구조](#3-프로젝트-구조)
4. [핵심 컴포넌트 구현](#4-핵심-컴포넌트-구현)
5. [빌드 및 테스트](#5-빌드-및-테스트)
6. [배포](#6-배포)

---

## 1. 프로젝트 생성

### 1.1 Android Studio 프로젝트 생성

1. **Android Studio** 실행
2. **New Project** 클릭
3. **Empty Activity** 선택
4. 프로젝트 설정:
   - **Name**: `NaverRankChecker`
   - **Package name**: `com.turafic.rankchecker`
   - **Language**: **Kotlin**
   - **Minimum SDK**: **API 26 (Android 8.0)**
5. **Finish** 클릭

### 1.2 프로젝트 초기 구조

```
NaverRankChecker/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/turafic/rankchecker/
│   │   │   │   ├── MainActivity.kt
│   │   │   │   ├── network/           # 네트워크 레이어
│   │   │   │   ├── checker/           # 순위 체크 로직
│   │   │   │   ├── models/            # 데이터 모델
│   │   │   │   └── worker/            # 백그라운드 작업
│   │   │   ├── res/
│   │   │   └── AndroidManifest.xml
│   │   └── test/
│   └── build.gradle.kts
└── build.gradle.kts
```

---

## 2. 의존성 설정

### 2.1 프로젝트 레벨 `build.gradle.kts`

```kotlin
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.jetbrains.kotlin.android) apply false
}
```

### 2.2 앱 레벨 `app/build.gradle.kts`

```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.jetbrains.kotlin.android)
    kotlin("plugin.serialization") version "1.9.0"
}

android {
    namespace = "com.turafic.rankchecker"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.turafic.rankchecker"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }

    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    // Android Core
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // HTTP 클라이언트 (Ktor)
    implementation("io.ktor:ktor-client-android:2.3.7")
    implementation("io.ktor:ktor-client-content-negotiation:2.3.7")
    implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.7")
    implementation("io.ktor:ktor-client-logging:2.3.7")

    // JSON 파싱
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")

    // WorkManager (백그라운드 작업)
    implementation("androidx.work:work-runtime-ktx:2.9.0")

    // WebView
    implementation("androidx.webkit:webkit:1.9.0")

    // Lifecycle
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")

    // Testing
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
}
```

---

## 3. 프로젝트 구조

### 3.1 패키지 구조

```
com.turafic.rankchecker/
├── MainActivity.kt                   # 메인 액티비티
├── network/
│   ├── TuraficApiClient.kt          # Turafic API 클라이언트
│   └── HttpHeaderGenerator.kt       # HTTP 헤더 생성
├── checker/
│   ├── NaverRankChecker.kt          # 네이버 순위 체크 로직
│   ├── WebViewManager.kt            # WebView 관리
│   └── CookieManager.kt             # 쿠키 관리
├── models/
│   ├── RankCheckTask.kt             # 작업 데이터 모델
│   ├── TaskVariables.kt             # 변수 모델
│   └── TrpcResponse.kt              # tRPC 응답 모델
└── worker/
    └── RankCheckWorker.kt           # 백그라운드 작업자
```

---

## 4. 핵심 컴포넌트 구현

### 4.1 데이터 모델 (`models/RankCheckTask.kt`)

```kotlin
package com.turafic.rankchecker.models

import kotlinx.serialization.Serializable

@Serializable
data class RankCheckTask(
    val taskId: String,
    val campaignId: Int,
    val keyword: String,
    val productId: String,
    val platform: String,
    val variables: TaskVariables
)

@Serializable
data class TaskVariables(
    val userAgent: String,
    val cookieStrategy: String,
    val referer: String,
    val secFetchSite: String,
    val cookies: Map<String, String>? = null
)

@Serializable
data class TrpcResponse<T>(
    val result: TrpcResult<T>
)

@Serializable
data class TrpcResult<T>(
    val data: T
)

@Serializable
data class GetTaskResponse(
    val success: Boolean,
    val message: String? = null,
    val task: RankCheckTask? = null
)

@Serializable
data class RegisterBotResponse(
    val success: Boolean,
    val botId: Int
)
```

### 4.2 Turafic API 클라이언트 (`network/TuraficApiClient.kt`)

```kotlin
package com.turafic.rankchecker.network

import android.util.Log
import com.turafic.rankchecker.models.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.android.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.logging.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.coroutines.delay
import kotlinx.serialization.json.Json
import java.net.URLEncoder

class TuraficApiClient(
    private val baseUrl: String = "http://localhost:5000/trpc"
) {
    private val httpClient = HttpClient(Android) {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                isLenient = true
            })
        }
        install(Logging) {
            logger = Logger.ANDROID
            level = LogLevel.INFO
        }
        install(HttpTimeout) {
            requestTimeoutMillis = 30_000
            connectTimeoutMillis = 10_000
        }
    }

    /**
     * 1. 봇 등록
     */
    suspend fun registerBot(deviceId: String, deviceModel: String): Int {
        return retryWithExponentialBackoff {
            val response: TrpcResponse<RegisterBotResponse> = httpClient.post("$baseUrl/rankCheck.registerBot") {
                contentType(ContentType.Application.Json)
                setBody(mapOf(
                    "deviceId" to deviceId,
                    "deviceModel" to deviceModel
                ))
            }.body()

            Log.d(TAG, "Bot registered: botId=${response.result.data.botId}")
            response.result.data.botId
        } ?: throw Exception("Failed to register bot")
    }

    /**
     * 2. 작업 요청
     */
    suspend fun getTask(botId: Int, loginId: String, imei: String): RankCheckTask? {
        return try {
            val input = URLEncoder.encode(
                """{"botId":$botId,"loginId":"$loginId","imei":"$imei"}""",
                "UTF-8"
            )
            val response: TrpcResponse<GetTaskResponse> = httpClient.get("$baseUrl/rankCheck.getTask?input=$input").body()

            if (response.result.data.success) {
                Log.d(TAG, "Task received: ${response.result.data.task?.taskId}")
                response.result.data.task
            } else {
                Log.d(TAG, "No tasks available")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "getTask error", e)
            null
        }
    }

    /**
     * 3. 순위 보고
     */
    suspend fun reportRank(
        taskId: String,
        campaignId: Int,
        rank: Int,
        success: Boolean,
        errorMessage: String? = null
    ) {
        retryWithExponentialBackoff {
            httpClient.post("$baseUrl/rankCheck.reportRank") {
                contentType(ContentType.Application.Json)
                setBody(mapOf(
                    "taskId" to taskId,
                    "campaignId" to campaignId,
                    "rank" to rank,
                    "timestamp" to kotlinx.datetime.Clock.System.now().toString(),
                    "success" to success,
                    "errorMessage" to errorMessage
                ))
            }
            Log.d(TAG, "Rank reported: campaignId=$campaignId, rank=$rank")
        }
    }

    /**
     * 4. 작업 완료
     */
    suspend fun finishTask(taskId: String, botId: Int) {
        retryWithExponentialBackoff {
            httpClient.post("$baseUrl/rankCheck.finishTask") {
                contentType(ContentType.Application.Json)
                setBody(mapOf(
                    "taskId" to taskId,
                    "botId" to botId
                ))
            }
            Log.d(TAG, "Task finished: $taskId")
        }
    }

    /**
     * 5. 봇 상태 업데이트
     */
    suspend fun updateBotStatus(botId: Int, status: String) {
        try {
            httpClient.post("$baseUrl/rankCheck.updateBotStatus") {
                contentType(ContentType.Application.Json)
                setBody(mapOf(
                    "botId" to botId,
                    "status" to status
                ))
            }
            Log.d(TAG, "Bot status updated: $status")
        } catch (e: Exception) {
            Log.e(TAG, "updateBotStatus error", e)
        }
    }

    /**
     * 재시도 로직 (지수 백오프)
     */
    private suspend fun <T> retryWithExponentialBackoff(
        maxRetries: Int = 3,
        initialDelayMillis: Long = 1000,
        block: suspend () -> T
    ): T? {
        var currentDelay = initialDelayMillis
        repeat(maxRetries) { attempt ->
            try {
                return block()
            } catch (e: Exception) {
                Log.w(TAG, "Retry attempt ${attempt + 1}/$maxRetries failed", e)
                if (attempt == maxRetries - 1) throw e
                delay(currentDelay)
                currentDelay *= 2
            }
        }
        return null
    }

    companion object {
        private const val TAG = "TuraficApiClient"
    }
}
```

### 4.3 네이버 순위 체크 (`checker/NaverRankChecker.kt`)

```kotlin
package com.turafic.rankchecker.checker

import android.util.Log
import android.webkit.WebView
import com.turafic.rankchecker.models.RankCheckTask
import kotlinx.coroutines.delay

class NaverRankChecker(
    private val webView: WebView,
    private val webViewManager: WebViewManager
) {
    /**
     * 순위 체크 메인 로직
     * PRD Section 7 기반
     */
    suspend fun checkRank(task: RankCheckTask): Int {
        Log.d(TAG, "Starting rank check for keyword: ${task.keyword}, productId: ${task.productId}")

        // 1. WebView 초기화
        webViewManager.initialize(task)

        // 2. 페이지별 검색
        for (page in 1..MAX_PAGES) {
            val url = buildSearchUrl(task.keyword, page)
            Log.d(TAG, "Checking page $page: $url")

            // 페이지 로드
            webViewManager.loadUrl(url)
            webViewManager.waitForPageLoad()

            // JavaScript로 상품 목록 추출
            val products = extractProducts()

            // 타겟 상품 찾기
            for ((index, product) in products.withIndex()) {
                if (product.mid1 == task.productId) {
                    val rank = (page - 1) * PRODUCTS_PER_PAGE + index + 1
                    Log.d(TAG, "Product found at rank: $rank")
                    return rank
                }
            }

            // 페이지 하단까지 스크롤
            webViewManager.scrollToBottom()
            delay(2000) // 2초 대기
        }

        Log.d(TAG, "Product not found in top ${MAX_PAGES * PRODUCTS_PER_PAGE} results")
        return -1 // 순위 못 찾음
    }

    /**
     * 검색 URL 생성
     */
    private fun buildSearchUrl(keyword: String, page: Int): String {
        return "https://msearch.shopping.naver.com/search/all" +
                "?query=${java.net.URLEncoder.encode(keyword, "UTF-8")}" +
                "&pagingIndex=$page" +
                "&sort=rel" +
                "&viewType=list" +
                "&productSet=total"
    }

    /**
     * JavaScript로 상품 목록 추출
     * PRD Section 7.2 기반
     */
    private suspend fun extractProducts(): List<Product> {
        val js = """
            (function() {
                var products = document.querySelectorAll('[data-product-id]');
                var result = [];
                for (var i = 0; i < products.length; i++) {
                    var mid1 = products[i].getAttribute('data-product-id');
                    result.push({ index: i, mid1: mid1 });
                }
                return JSON.stringify(result);
            })();
        """.trimIndent()

        val result = webViewManager.evaluateJavaScript(js)
        return parseProducts(result)
    }

    /**
     * JSON 파싱
     */
    private fun parseProducts(json: String): List<Product> {
        // TODO: JSON 파싱 구현
        return emptyList()
    }

    data class Product(
        val index: Int,
        val mid1: String
    )

    companion object {
        private const val TAG = "NaverRankChecker"
        private const val PRODUCTS_PER_PAGE = 40
        private const val MAX_PAGES = 10
    }
}
```

### 4.4 WebView 관리자 (`checker/WebViewManager.kt`)

```kotlin
package com.turafic.rankchecker.checker

import android.webkit.*
import com.turafic.rankchecker.models.RankCheckTask
import kotlinx.coroutines.CompletableDeferred

class WebViewManager(private val webView: WebView) {

    private var pageLoadComplete = CompletableDeferred<Boolean>()

    /**
     * WebView 초기화
     * PRD Section 2.2.3 기반
     */
    fun initialize(task: RankCheckTask) {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            userAgentString = task.variables.userAgent
            cacheMode = WebSettings.LOAD_NO_CACHE
        }

        // 쿠키 설정
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)

        task.variables.cookies?.forEach { (key, value) ->
            cookieManager.setCookie(".naver.com", "$key=$value")
        }
        cookieManager.flush()

        // WebViewClient 설정
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                pageLoadComplete.complete(true)
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                pageLoadComplete.completeExceptionally(Exception("Page load error"))
            }
        }
    }

    /**
     * URL 로드
     */
    fun loadUrl(url: String) {
        pageLoadComplete = CompletableDeferred()
        webView.loadUrl(url)
    }

    /**
     * 페이지 로드 완료 대기
     */
    suspend fun waitForPageLoad() {
        pageLoadComplete.await()
    }

    /**
     * JavaScript 실행
     */
    suspend fun evaluateJavaScript(script: String): String {
        val result = CompletableDeferred<String>()
        webView.evaluateJavascript(script) { value ->
            result.complete(value ?: "")
        }
        return result.await()
    }

    /**
     * 페이지 하단까지 스크롤
     */
    fun scrollToBottom() {
        webView.evaluateJavascript("window.scrollTo(0, document.body.scrollHeight);", null)
    }
}
```

### 4.5 백그라운드 작업자 (`worker/RankCheckWorker.kt`)

```kotlin
package com.turafic.rankchecker.worker

import android.content.Context
import android.util.Log
import androidx.work.*
import com.turafic.rankchecker.checker.NaverRankChecker
import com.turafic.rankchecker.network.TuraficApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

class RankCheckWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private val apiClient = TuraficApiClient()
    private val botId = inputData.getInt("BOT_ID", -1)
    private val loginId = inputData.getString("LOGIN_ID") ?: ""
    private val imei = inputData.getString("IMEI") ?: ""

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "RankCheckWorker started")

            // 1. 봇 상태 업데이트
            apiClient.updateBotStatus(botId, "online")

            // 2. 작업 요청
            val task = apiClient.getTask(botId, loginId, imei)
            if (task == null) {
                Log.d(TAG, "No tasks available, will retry later")
                return@withContext Result.success()
            }

            // 3. 순위 체크 실행
            // TODO: WebView는 메인 스레드에서만 실행 가능하므로 Service로 이동 필요
            val rank = performRankCheck(task)

            // 4. 순위 보고
            apiClient.reportRank(
                taskId = task.taskId,
                campaignId = task.campaignId,
                rank = rank,
                success = rank != -1
            )

            // 5. 작업 완료
            apiClient.finishTask(task.taskId, botId)

            Log.d(TAG, "RankCheckWorker completed successfully")
            Result.success()

        } catch (e: Exception) {
            Log.e(TAG, "RankCheckWorker failed", e)
            apiClient.updateBotStatus(botId, "error")
            Result.retry()
        }
    }

    private fun performRankCheck(task: RankCheckTask): Int {
        // TODO: 실제 순위 체크 구현
        // WebView는 UI 스레드에서만 작동하므로 별도 처리 필요
        return -1
    }

    companion object {
        private const val TAG = "RankCheckWorker"
        private const val WORK_NAME = "rank_check_periodic"

        /**
         * 주기적 작업 스케줄링 (10분마다)
         */
        fun schedule(context: Context, botId: Int, loginId: String, imei: String) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val inputData = workDataOf(
                "BOT_ID" to botId,
                "LOGIN_ID" to loginId,
                "IMEI" to imei
            )

            val work = PeriodicWorkRequestBuilder<RankCheckWorker>(
                10, TimeUnit.MINUTES
            )
                .setConstraints(constraints)
                .setInputData(inputData)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                work
            )

            Log.d(TAG, "Periodic work scheduled")
        }
    }
}
```

---

## 5. 빌드 및 테스트

### 5.1 빌드

```bash
./gradlew assembleDebug
```

**Output**: `app/build/outputs/apk/debug/app-debug.apk`

### 5.2 설치

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

### 5.3 로그 모니터링

```bash
adb logcat | grep -E "TuraficApiClient|NaverRankChecker|RankCheckWorker"
```

---

## 6. 배포

### 6.1 Release 빌드

```bash
./gradlew assembleRelease
```

### 6.2 APK 서명

```bash
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore my-release-key.jks \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  alias_name
```

---

## 다음 단계

1. ✅ 서버 API 완성
2. ⏳ Android 프로젝트 생성 (이 가이드 참고)
3. ⏳ 핵심 컴포넌트 구현
4. ⏳ 통합 테스트
5. ⏳ 실제 네이버 쇼핑 테스트

---

**참고 문서**:
- [API 명세서](../api/RANK_CHECK_API.md)
- [PRD](../NAVER_RANK_CHECKER_PRD.md)

---

**문서 끝**
