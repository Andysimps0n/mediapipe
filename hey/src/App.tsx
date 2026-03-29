import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, RotateCcw, Coffee, Brain, ChevronRight, Video, VideoOff } from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const PRESETS = [
  { id: 'pomodoro', label: 'Pomodoro', minutes: 25, icon: Brain },
  { id: 'short', label: 'Short Break', minutes: 5, icon: Coffee },
  { id: 'long', label: 'Long Break', minutes: 15, icon: Coffee },
];

export default function App() {
  // --- 오디오 관련 ---
  const audioRef = useRef(new Audio('music.mp3'));
  const [isPlaying, setIsPlaying] = useState(false);

  // --- 기존 타이머 상태 ---
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [totalTime, setTotalTime] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [activePreset, setActivePreset] = useState('pomodoro');
  const timerRef = useRef(null);

  // --- 웹캠 및 AI 상태/Ref ---
  const [isOnVideo, setIsOnVideo] = useState(false)
  const videoRef = useRef(null);
  const landmarkerRef = useRef(null);
  const [isWebcamReady, setIsWebcamReady] = useState(false);
  
  // --- [중요] 2초 카운트를 위한 Ref ---
  const closedDurationRef = useRef(0); // 눈을 감은 지속 시간 (ms)
  const lastTimestampRef = useRef(performance.now()); // 이전 프레임 시간

  // 테스트 함수
  // 테스트용 함수: 졸음 상황 강제 발생
const handleTestAlert = () => {
  console.log("--- 테스트 모드: 졸음 상황 시뮬레이션 시작 ---");
  
  setIsPlaying(!isPlaying);
  setIsActive(!isActive);
  
};

  // 오디오 재생/정지 제어
  useEffect(() => {
    if (isPlaying) {
      audioRef.current.play().catch(e => console.log("재생 실패: ", e));
      audioRef.current.loop = true; // 알람이니 반복 재생
    } else {
      audioRef.current.pause();
      audioRef.current.currentTime = 0; // 정지 시 처음으로
    }
  }, [isPlaying]);

  // AI 초기화
  useEffect(() => {
    async function initAI() {
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
      landmarkerRef.current = landmarker;
    }
    initAI();
  }, []);

  // 비디오 끄기
  useEffect(() => {
    if (isOnVideo) {
      startWebcam();
    } else {
      // 비디오 끄기 로직
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop()); // 1. 트랙 정지
        videoRef.current.srcObject = null;      // 2. 참조 제거
      }
      setIsWebcamReady(false);                 // 3. 상태 초기화
    }
  }, [isOnVideo]);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => {
          setIsWebcamReady(true);
          lastTimestampRef.current = performance.now();
          predictWebcam();
        };
      }
    } catch (err) {
      console.error("웹캠 접근 실패:", err);
    }
  };

  const predictWebcam = useCallback(() => {
    const now = performance.now();
    const deltaTime = now - lastTimestampRef.current; // 프레임 간 간격 (ms)
    lastTimestampRef.current = now;

    if (videoRef.current && landmarkerRef.current && videoRef.current.readyState >= 2) {
      const results = landmarkerRef.current.detectForVideo(videoRef.current, now);

      if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
        const categories = results.faceBlendshapes[0].categories;
        const blinkLeft = categories.find(c => c.categoryName === "eyeBlinkLeft")?.score || 0;
        const blinkRight = categories.find(c => c.categoryName === "eyeBlinkRight")?.score || 0;
        const avgBlink = (blinkLeft + blinkRight) / 2;

        // --- 2초 감지 로직 ---
        if (avgBlink > 0.5) {
          // 눈을 감고 있는 상태면 시간 누적
          closedDurationRef.current += deltaTime;
          
          if (closedDurationRef.current >= 1500) { // 3000ms = 3초
            console.log("1초 경과: 졸음 감지!");
            setIsPlaying(true); // 음악 재생
            toggleTimer()
          }
        } else {
          // 눈을 뜨면 즉시 카운트 초기화 및 음악 정지
          closedDurationRef.current = 0;
          setIsPlaying(false); 
        }
      }
    }
    requestAnimationFrame(predictWebcam);
  }, []);

  // 타이머 로직 (기존 유지)
  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isActive, timeLeft]);


  const toggleTimer = () => setIsActive(!isActive);
  const resetTimer = useCallback(() => {
    setIsActive(false);
    const preset = PRESETS.find(p => p.id === activePreset);
    if (preset) {
      setTimeLeft(preset.minutes * 60);
      setTotalTime(preset.minutes * 60);
    }
  }, [activePreset]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = ((totalTime - timeLeft) / totalTime) * 100;
  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="app-container">
      <main className="main-content">
        
        {/* 웹캠 화면 */}
        <div className="webcam-card">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={`webcam-video ${isPlaying ? 'drowsy' : ''}`}
          />
          {isPlaying && (
            <div className="alert-overlay">
              <span className="alert-text">WAKE UP!</span>
            </div>
          )}
          {!isWebcamReady && (
            <div className="loading-text">Camera is Off</div>
          )}
        </div>

        {/* 타이머 서클 */}
        <div className="timer-section">
          <svg className="timer-svg">
            <circle cx="160" cy="160" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className="circle-bg" />
            <motion.circle
              cx="160" cy="160" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent"
              strokeDasharray={circumference}
              animate={{ strokeDashoffset: offset }}
              className="circle-progress"
            />
          </svg>
          <div className="timer-display">
            <motion.span key={timeLeft} className="time-numbers">
              {formatTime(timeLeft)}
            </motion.span>
            <span className={`status-label ${isPlaying ? 'alert' : ''}`}>
              {isPlaying ? 'Drowsy Alert' : (isActive ? 'Focusing' : 'Paused')}
            </span>
          </div>
        </div>

        {/* 컨트롤 버튼 */}
        <div className="controls-group">
          <button onClick={resetTimer} className="btn-icon">
            <RotateCcw size={24} />
          </button>
          
          <button
            onClick={()=>{toggleTimer(),console.log(`btn-play-pause ${isActive ? 'active' : 'paused'}`)}}
            className={`btn-play-pause ${isActive ? 'active' : 'paused'}`}
          >
            {isActive ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" style={{marginLeft: '4px'}} />}
          </button>

          {/* Camera Toggle Button */}
          <button
            onClick={()=>{setIsOnVideo(!isOnVideo), console.log(`btn-video ${isOnVideo ? 'active' : 'paused'}`)}}
            className={`btn-video ${isOnVideo ? 'active' : 'paused'}`}
          >
            {isOnVideo ? <VideoOff size={32} fill="currentColor" /> : <Video size={32} fill="currentColor"/>}
          </button>


        </div>
      </main>
    </div>
  );
}