// FaceDetector 대신 FaceLandmarker를 가져옵니다.
import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

const demosSection = document.getElementById("demos");
let faceLandmarker;
let runningMode = "IMAGE";
let video = document.getElementById("webcam");
const liveView = document.getElementById("liveView");
let children = [];

// 1. 초기화: FaceDetector -> FaceLandmarker로 변경
const initializeFaceLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
        },
        outputFaceBlendshapes: true, // 눈 감기 정도를 수치로 받기 위해 필요
        runningMode: runningMode,
        numFaces: 1
    });
    demosSection.classList.remove("invisible");
};
initializeFaceLandmarker();

// 2. 눈 감음 판단 로직 (Blendshapes 활용)
// MediaPipe의 Blendshapes는 눈이 감긴 정도를 0~1 사이로 제공합니다.
function checkBlink(blendshapes) {
    const categories = blendshapes[0].categories;
    let eyeLookDownLeft = 0;
    let eyeLookDownRight = 0;

    // eyeBlinkLeft, eyeBlinkRight 점수를 찾습니다.
    categories.forEach(category => {
        if (category.categoryName === "eyeBlinkLeft") eyeLookDownLeft = category.score;
        if (category.categoryName === "eyeBlinkRight") eyeLookDownRight = category.score;
    });

    // 두 눈의 평균 감김 정도가 0.4 이상이면 감은 것으로 판단 (임계값 조정 가능)
    if ((eyeLookDownLeft + eyeLookDownRight) / 2 > 0.4) {
        console.log("졸음 감지! (Status: Closed)");
        // 여기서 효과음 재생 함수 호출
    }
}

// 3. 웹캠 예측 루프
let lastVideoTime = -1;
async function predictWebcam() {
    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await faceLandmarker.setOptions({ runningMode: "VIDEO" });
    }

    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        const results = faceLandmarker.detectForVideo(video, startTimeMs);

        // 결과가 있고 랜드마크가 검출되었을 때
        if (results.faceLandmarks) {
            displayVideoDetections(results);
            if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
                checkBlink(results.faceBlendshapes);
            }
        }
    }
    window.requestAnimationFrame(predictWebcam);
}

// 4. 화면 표시 (기존 displayVideoDetections 로직 유지 및 수정)
function displayVideoDetections(results) {
    for (let child of children) {
        liveView.removeChild(child);
    }
    children.splice(0);

    // Face Landmarker는 boundingBox를 직접 주지 않으므로 랜드마크 기반으로 그릴 수 있습니다.
    // 여기서는 간단하게 눈 주변 랜드마크에 점을 찍는 방식으로 시각화합니다.
    results.faceLandmarks.forEach((landmarks) => {
        // 특정 주요 포인트만 표시 (예: 눈 주변)
        [33, 133, 362, 263].forEach(index => {
            const keypoint = landmarks[index];
            const keypointEl = document.createElement("span");
            keypointEl.className = "key-point";
            keypointEl.style.top = `${keypoint.y * video.offsetHeight}px`;
            keypointEl.style.left = `${keypoint.x * video.offsetWidth}px`;
            liveView.appendChild(keypointEl);
            children.push(keypointEl);
        });
    });
}

// 웹캠 활성화 버튼 이벤트 (기존 코드 유지)
let enableWebcamButton = document.getElementById("webcamButton");
enableWebcamButton.addEventListener("click", async () => {
    const constraints = { video: true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    video.addEventListener("loadeddata", predictWebcam);
});