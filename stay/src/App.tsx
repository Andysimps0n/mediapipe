import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Timer, Play, Pause, RotateCcw, Video, VideoOff } from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import './index.css';

export default function App() {
  // --- Stopwatch State ---
  const [firstClickTime, setFirstClickTime] = useState(null);
  const [clickCount, setClickCount] = useState(0);
  const [currentTime, setCurrentTime] = useState(performance.now());
  const [isStopped, setIsStopped] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [isBlinking, setIsBlinking] = useState(false);

  // --- AI & Webcam State ---
  const [isOnVideo, setIsOnVideo] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false); // Alarm state
  const [isWebcamReady, setIsWebcamReady] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const audioRef = useRef(new Audio('music.mp3'));
  const requestRef = useRef(null);
  
  // Detection persistence
  const closedDurationRef = useRef(0);
  const lastTimestampRef = useRef(performance.now());

  // 1. Initialize AI
  useEffect(() => {
    async function initAI() {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );
      landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU",
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1,
      });
    }
    initAI();
  }, []);

  // 2. Alarm Control
  useEffect(() => {
    if (isPlaying) {
      audioRef.current.play().catch(() => {});
      audioRef.current.loop = true;
    } else {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [isPlaying]);

  // 3. Webcam Toggle Logic
  useEffect(() => {
    if (isOnVideo) {
      startWebcam();
    } else {
      stopWebcam();
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
      console.error("Webcam failed:", err);
    }
  };

  const stopWebcam = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsWebcamReady(false);
    setIsPlaying(false);
  };

  // 4. Prediction & Blink Detection Loop
  const predictWebcam = useCallback(() => {
    const now = performance.now();
    const deltaTime = now - lastTimestampRef.current;
    lastTimestampRef.current = now;

    if (videoRef.current?.readyState >= 2 && landmarkerRef.current) {
      const results = landmarkerRef.current.detectForVideo(videoRef.current, now);

      if (results.faceBlendshapes?.length > 0) {
        const categories = results.faceBlendshapes[0].categories;
        const blinkLeft = categories.find(c => c.categoryName === "eyeBlinkLeft")?.score || 0;
        const blinkRight = categories.find(c => c.categoryName === "eyeBlinkRight")?.score || 0;
        const avgBlink = (blinkLeft + blinkRight) / 2;

        if (avgBlink > 0.5) {
          closedDurationRef.current += deltaTime;
          if (closedDurationRef.current >= 1500) {
            setIsPlaying(true);
            setIsStopped(true); // Stop the stopwatch on drowsiness
          }
        } else {
          closedDurationRef.current = 0;
          setIsPlaying(false);
        }
      }
      
      if (results.faceLandmarks && canvasRef.current) {
        drawLandmarks(results.faceLandmarks);
      }
    }
    if (isOnVideo) requestRef.current = requestAnimationFrame(predictWebcam);
  }, [isOnVideo]);

  const drawLandmarks = (landmarks) => {
    const ctx = canvasRef.current.getContext("2d");
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.fillStyle = "#f97316";
    landmarks[0].forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x * canvasRef.current.width, pt.y * canvasRef.current.height, 1, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  // 5. Stopwatch Logic
  const animate = () => {
    if (!isStopped && countdown === null) {
      setCurrentTime(performance.now());
      requestRef.current = requestAnimationFrame(animate);
    }
  };

  const startCountdown = () => {
    setCountdown(3);
    setIsBlinking(true);
  };

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 800);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      const now = performance.now();
      setCountdown(null);
      setIsBlinking(false);
      setFirstClickTime(now);
      setCurrentTime(now);
      setClickCount(1);
    }
  }, [countdown]);

  useEffect(() => {
    if (firstClickTime !== null && !isStopped && countdown === null) {
      requestRef.current = requestAnimationFrame(animate);
    }
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [firstClickTime, isStopped, countdown]);

  const handleClick = () => {
    const now = performance.now();
    if (isStopped || firstClickTime === null) {
      if (countdown !== null) return;
      handleReset();
      startCountdown();
      return;
    }
    setClickCount(2);
    setIsStopped(true);
    setCurrentTime(now);
  };

  const handleReset = () => {
    setFirstClickTime(null);
    setClickCount(0);
    setIsStopped(false);
    setCountdown(null);
    setIsBlinking(false);
    setIsPlaying(false);
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
  };

  const totalElapsed = firstClickTime !== null ? currentTime - firstClickTime : 0;

  return (
    <div className="app-container">
      <div className="bg-decoration">
        <div className="bg-glow-orb" />
        <div className="bg-grid-overlay" />
      </div>

      <div className="main-content">
        {/* REFACTORED: The "Box" is now the Video Card */}
        <div className="webcam-card">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={`webcam-video ${isPlaying ? 'drowsy' : ''}`}
          />
          <canvas ref={canvasRef} className="canvas-overlay" />
          
          <AnimatePresence>
            {isPlaying && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="alert-overlay"
              >
                <span className="alert-text">WAKE UP!</span>
              </motion.div>
            )}
          </AnimatePresence>

          {!isWebcamReady && (
            <div className="loading-text">Camera is Off</div>
          )}
        </div>

        <div className="timer-display-container">
          <div className="timer-label">
            <Timer className="icon-timer" />
            <span className="label-text">
              {countdown !== null ? 'Get Ready' : isStopped ? 'Final Result' : 'Elapsed Time'}
            </span>
          </div>
          
          <div className="timer-value-wrapper">
            <AnimatePresence mode="wait">
              {countdown !== null ? (
                <motion.div 
                  key={`countdown-${countdown}`}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1.2, opacity: 1 }}
                  exit={{ scale: 1.5, opacity: 0 }}
                  className="timer-number countdown-active"
                >
                  {countdown}
                </motion.div>
              ) : (
                <motion.div 
                  animate={isStopped ? { scale: 1.1, color: "#f97316" } : {}}
                  className={`timer-number ${isBlinking ? 'blink-animation' : ''}`}
                >
                  {totalElapsed.toFixed(0)}
                  <span className="unit-ms">ms</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Phase</div>
            <div className="stat-value">{countdown !== null ? 'WAIT' : `${clickCount}/2`}</div>
          </div>

          <div className="reset-action">
            <button onClick={handleClick} className="reset-button">
              {countdown !== null ? (
                <div className="spinner" />
              ) : (isStopped || firstClickTime === null) ? (
                <Play size={32} fill="currentColor" style={{marginLeft: '4px'}} />
              ) : (
                <Pause size={32} fill="currentColor" />
              )}
            </button>
            <button onClick={() => setIsOnVideo(!isOnVideo)} className="video-toggle-btn">
               {isOnVideo ? <VideoOff size={20} /> : <Video size={20} />}
            </button>
          </div>

          <div className="stat-card">
            <div className="stat-label">Status</div>
            <div className={`stat-value status-text ${countdown !== null ? 'text-waiting' : isStopped ? 'text-stopped' : firstClickTime ? 'text-running' : 'text-ready'}`}>
              {countdown !== null ? "COUNT" : isStopped ? "STOPPED" : firstClickTime ? "RUNNING" : "READY"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}