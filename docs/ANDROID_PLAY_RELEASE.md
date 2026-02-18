# Android Google Play Release (리뷰랩)

## 1) 프로젝트 정보
- App name: `리뷰랩`
- Package: `kr.reviewlab.app`
- Runtime: Capacitor WebView (`https://www.reviewlab.kr`)

## 2) 1회 설정
```bash
npm install
npm run cap:sync:android
```

## 3) 업로드 키(keystore) 생성
이 PC에서 `keytool`이 PATH에 없으면 Android Studio에서 생성:

1. Android Studio에서 `android` 폴더 열기
2. `Build > Generate Signed Bundle / APK`
3. `Android App Bundle` 선택
4. `Create new...`로 신규 키스토어 생성
   - 권장 파일명: `android/keystore/reviewlab-upload.jks`
   - Alias: `reviewlab-upload`
5. 생성 완료 후 `android/keystore.properties.example`을 복사:
   - `android/keystore.properties` 생성
   - 비밀번호/경로 값 입력

`android/keystore.properties` 예시:
```properties
storeFile=../keystore/reviewlab-upload.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=reviewlab-upload
keyPassword=YOUR_KEY_PASSWORD
```

## 4) AAB 빌드
```bash
cd android
.\gradlew bundleRelease
```

결과물:
- `android/app/build/outputs/bundle/release/app-release.aab`

## 5) Play Console 업로드
1. Google Play Console > 앱 생성
2. 내부 테스트 트랙에 `app-release.aab` 업로드
3. 앱 정보/스크린샷/개인정보처리방침/데이터 세이프티 입력
4. 검토 후 프로덕션 배포

## 6) 업데이트 배포
1. 웹 배포 (`https://www.reviewlab.kr`) 먼저 반영
2. 앱 자체 변경(아이콘/권한/네이티브 설정) 있는 경우만 AAB 재빌드 및 재업로드

