import React, { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const FaceLandmarkerComponent = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null); // 랜드마크를 그릴 캔버스
  const [faceLandmarker, setFaceLandmarker] = useState(null);
  const [isWebcamRunning, setIsWebcamRunning] = useState(false);
  let lastVideoTime = -1;

  // 1. 초기화: FaceLandmarker 로드
  useEffect(() => {
    const initialize = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU",
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1,
      });
      setFaceLandmarker(landmarker);
    };
    initialize();
  }, []);

  // 2. 눈 감음 판단 로직
  const checkBlink = (blendshapes) => {
    if (!blendshapes || blendshapes.length === 0) return;

    const categories = blendshapes[0].categories;
    let blinkLeft = 0;
    let blinkRight = 0;

    categories.forEach((category) => {
      if (category.categoryName === "eyeBlinkLeft") blinkLeft = category.score;
      if (category.categoryName === "eyeBlinkRight") blinkRight = category.score;
    });

    // 임계값 0.4 설정 (졸음 감지)
    if ((blinkLeft + blinkRight) / 2 > 0.5) {
      console.log("졸음 감지! (Status: Closed)");
    }
  };

  // 3. 웹캠 예측 루프
  const predictWebcam = async () => {
    if (videoRef.current && faceLandmarker && videoRef.current.currentTime !== lastVideoTime) {
      lastVideoTime = videoRef.current.currentTime;
      
      const startTimeMs = performance.now();
      const results = faceLandmarker.detectForVideo(videoRef.current, startTimeMs);

      if (results.faceLandmarks) {
        drawLandmarks(results.faceLandmarks);
        checkBlink(results.faceBlendshapes);
      }
    }
    
    if (isWebcamRunning) {
      window.requestAnimationFrame(predictWebcam);
    }
  };

  // 4. 캔버스에 시각화 (기존 span 태그 생성 방식 대신 캔버스 권장)
  const drawLandmarks = (faceLandmarks) => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    ctx.fillStyle = "#FF0000";
    faceLandmarks.forEach((landmarks) => {
      // 눈 부위 주요 인덱스
      [33, 133, 362, 263].forEach((index) => {
        const x = landmarks[index].x * canvasRef.current.width;
        const y = landmarks[index].y * canvasRef.current.height;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fill();
      });
    });
  };

  // 5. 웹캠 토글
  const toggleWebcam = async () => {
    if (isWebcamRunning) {
      setIsWebcamRunning(false);
      const stream = videoRef.current.srcObject;
      stream.getTracks().forEach(track => track.stop());
    } else {
      setIsWebcamRunning(true);
      const constraints = { video: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoRef.current.srcObject = stream;
      videoRef.current.addEventListener("loadeddata", predictWebcam);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <h1>React Face Landmarker</h1>
      <button onClick={toggleWebcam}>
        {isWebcamRunning ? "DISABLE WEBCAM" : "ENABLE WEBCAM"}
      </button>
      
      <div style={{ position: "relative", marginTop: "20px" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{ width: "640px", height: "480px" }}
        />
        <canvas
          ref={canvasRef}
          width="640"
          height="480"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
};

export default FaceLandmarkerComponent;