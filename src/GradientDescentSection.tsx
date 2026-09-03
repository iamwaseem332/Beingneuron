import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import { usePrefersReducedMotion } from "./hooks";
import { Eyebrow, Reveal } from "./ui";

/* ==================== TYPES ==================== */
type LandscapeType = "bowl" | "valley" | "wideValley" | "narrowValley" | "saddle" | "multiBasin" | "asymmetric";
type PlaybackState = "playing" | "paused";
type Speed = "slow" | "normal" | "fast";

interface LandscapeConfig {
  type: LandscapeType;
  label: string;
}

const LANDSCAPES: LandscapeConfig[] = [
  { type: "bowl", label: "Bowl" },
  { type: "valley", label: "Valley" },
  { type: "wideValley", label: "Wide Valley" },
  { type: "narrowValley", label: "Narrow Valley" },
  { type: "saddle", label: "Saddle" },
  { type: "multiBasin", label: "Multi-Basin" },
  { type: "asymmetric", label: "Asymmetric" },
];

/* ==================== LOSS FUNCTIONS ==================== */
// Returns height (loss) at position (x, z)
function evaluateLoss(x: number, z: number, type: LandscapeType): number {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  
  switch (type) {
    case "bowl": {
      // Simple quadratic bowl
      const r = Math.sqrt(x * x + z * z);
      return r * r * 0.5;
    }
    case "valley": {
      // Elongated valley along z-axis
      const across = x * x * 0.8;
      const along = z * z * 0.05;
      return across + along;
    }
    case "wideValley": {
      // Broad, flat valley
      const across = Math.pow(Math.abs(x), 1.5) * 0.4;
      const along = z * z * 0.02;
      return across + along;
    }
    case "narrowValley": {
      // Tight, steep valley
      const across = x * x * 1.5;
      const along = z * z * 0.08;
      return across + along;
    }
    case "saddle": {
      // Saddle: rises in x, falls in z
      return x * x * 0.6 - z * z * 0.3;
    }
    case "multiBasin": {
      // Multiple Gaussian basins
      const basin1 = Math.pow((x + 2) * (x + 2) + z * z, 1.2) * 0.3;
      const basin2 = Math.pow((x - 2) * (x - 2) + (z + 1) * (z + 1), 1.1) * 0.35;
      const basin3 = Math.pow(x * x + (z - 2) * (z - 2), 1.3) * 0.25;
      return Math.min(basin1, basin2, basin3);
    }
    case "asymmetric": {
      // Asymmetric basin with offset minimum
      const dx = x - 0.8;
      const dz = z + 0.5;
      const base = dx * dx * 0.7 + dz * dz * 0.5;
      const skew = x * 0.15 - z * 0.1;
      return base + skew;
    }
    default:
      return x * x + z * z;
  }
}

// Compute gradient (numerical approximation)
function computeGradient(x: number, z: number, type: LandscapeType, h = 0.01): { gx: number; gz: number } {
  const fx = evaluateLoss(x, z, type);
  const fxPlusDx = evaluateLoss(x + h, z, type);
  const fxPlusDz = evaluateLoss(x, z + h, type);
  return {
    gx: (fxPlusDx - fx) / h,
    gz: (fxPlusDz - fx) / h,
  };
}

// Find minimum location for each landscape
function getMinimumPosition(type: LandscapeType): { x: number; z: number } {
  switch (type) {
    case "bowl":
      return { x: 0, z: 0 };
    case "valley":
    case "wideValley":
    case "narrowValley":
      return { x: 0, z: 0 };
    case "saddle":
      return { x: 0, z: 0 };
    case "multiBasin":
      return { x: -2, z: 0 };
    case "asymmetric":
      return { x: 0.8, z: -0.5 };
    default:
      return { x: 0, z: 0 };
  }
}

// Get starting position for each landscape
function getStartPosition(type: LandscapeType): { x: number; z: number } {
  switch (type) {
    case "bowl":
      return { x: 3.5, z: 2.5 };
    case "valley":
      return { x: 3, z: -1 };
    case "wideValley":
      return { x: 3.5, z: 1.5 };
    case "narrowValley":
      return { x: 2.5, z: -0.5 };
    case "saddle":
      return { x: 2.5, z: 2 };
    case "multiBasin":
      return { x: 0, z: 2.5 };
    case "asymmetric":
      return { x: -2, z: 2 };
    default:
      return { x: 3, z: 2 };
  }
}

/* ==================== GRADIENT DESCENT VISUALIZATION ==================== */
export default function GradientDescentSection() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // State
  const [landscapeType, setLandscapeType] = useState<LandscapeType>("bowl");
  const [playbackState, setPlaybackState] = useState<PlaybackState>("playing");
  const [speed, setSpeed] = useState<Speed>("normal");
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Refs for Three.js
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const surfaceRef = useRef<THREE.Mesh | null>(null);
  const pointRef = useRef<THREE.Mesh | null>(null);
  const trajectoryRef = useRef<THREE.Line | null>(null);
  const animationFrameRef = useRef<number>(0);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());

  // Optimization state refs (mutable, no re-renders)
  const positionRef = useRef({ x: 0, z: 0 });
  const trajectoryPointsRef = useRef<{ x: number; z: number; y: number }[]>([]);
  const phaseRef = useRef<"start" | "descent" | "converging" | "minimum" | "reset">("start");
  const startTimeRef = useRef<number>(0);
  const descentDurationRef = useRef<number>(8000);
  const targetPosRef = useRef({ x: 0, z: 0 });
  const startPosRef = useRef({ x: 0, z: 0 });

  // Speed multipliers
  const speedMultipliers = useMemo(() => ({
    slow: 0.5,
    normal: 1.0,
    fast: 1.8,
  }), []);

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1a26);
    scene.fog = new THREE.Fog(0x0b1a26, 8, 20);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(6, 5, 6);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xe8f4f0, 1.2);
    keyLight.position.set(5, 8, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x7dd3c4, 0.4);
    fillLight.position.set(-4, 3, -3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.25);
    rimLight.position.set(0, 2, -6);
    scene.add(rimLight);

    // Create surface
    createSurface(scene, landscapeType);

    // Create optimization point
    createOptimizationPoint(scene);

    // Create trajectory line
    createTrajectory(scene);

    // Add subtle grid
    const gridHelper = new THREE.GridHelper(10, 20, 0x1e3a4a, 0x0f2330);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // Handle resize
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener("resize", handleResize);

    // Start animation loop
    clockRef.current.start();
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameRef.current);
      
      // Cleanup
      if (surfaceRef.current) {
        surfaceRef.current.geometry.dispose();
        (surfaceRef.current.material as THREE.Material).dispose();
      }
      if (pointRef.current) {
        pointRef.current.geometry.dispose();
        (pointRef.current.material as THREE.Material).dispose();
      }
      if (trajectoryRef.current) {
        trajectoryRef.current.geometry.dispose();
        (trajectoryRef.current.material as THREE.Material).dispose();
      }
      renderer.dispose();
      scene.clear();
    };
  }, []);

  // Create surface mesh
  const createSurface = (scene: THREE.Scene, type: LandscapeType) => {
    if (surfaceRef.current) {
      scene.remove(surfaceRef.current);
      surfaceRef.current.geometry.dispose();
      (surfaceRef.current.material as THREE.Material).dispose();
    }

    const size = 8;
    const segments = 128;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position.array;
    const colors = new Float32Array(positions.length);

    // Generate heights and colors
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      const y = evaluateLoss(x, z, type);
      positions[i + 1] = y;

      // Color based on height (loss)
      const normalizedHeight = Math.min(1, y / 8);
      
      // Low loss: teal/cyan, High loss: deeper blue
      const r = THREE.MathUtils.lerp(0.05, 0.08, normalizedHeight);
      const g = THREE.MathUtils.lerp(0.35, 0.15, normalizedHeight);
      const b = THREE.MathUtils.lerp(0.38, 0.25, normalizedHeight);
      
      colors[i] = r;
      colors[i + 1] = g;
      colors[i + 2] = b;
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.65,
      metalness: 0.15,
      side: THREE.DoubleSide,
      flatShading: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    surfaceRef.current = mesh;
  };

  // Create optimization point
  const createOptimizationPoint = (scene: THREE.Scene) => {
    if (pointRef.current) {
      scene.remove(pointRef.current);
      pointRef.current.geometry.dispose();
      (pointRef.current.material as THREE.Material).dispose();
    }

    const geometry = new THREE.SphereGeometry(0.15, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: 0xf4a261,
      emissive: 0xe76f51,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.7,
    });

    const point = new THREE.Mesh(geometry, material);
    point.castShadow = true;
    scene.add(point);
    pointRef.current = point;
  };

  // Create trajectory line
  const createTrajectory = (scene: THREE.Scene) => {
    if (trajectoryRef.current) {
      scene.remove(trajectoryRef.current);
      trajectoryRef.current.geometry.dispose();
      (trajectoryRef.current.material as THREE.Material).dispose();
    }

    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      color: 0xf4a261,
      transparent: true,
      opacity: 0.8,
      linewidth: 2,
    });

    const line = new THREE.Line(geometry, material);
    scene.add(line);
    trajectoryRef.current = line;
  };

  // Update trajectory geometry
  const updateTrajectory = () => {
    if (!trajectoryRef.current) return;

    const points = trajectoryPointsRef.current;
    if (points.length < 2) return;

    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = points[i].x;
      positions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = points[i].z;
    }

    trajectoryRef.current.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    trajectoryRef.current.geometry.attributes.position.needsUpdate = true;
  };

  // Reset optimization to start
  const resetOptimization = useCallback(() => {
    const start = getStartPosition(landscapeType);
    const target = getMinimumPosition(landscapeType);
    
    positionRef.current = { ...start };
    startPosRef.current = { ...start };
    targetPosRef.current = { ...target };
    trajectoryPointsRef.current = [];
    phaseRef.current = "start";
    startTimeRef.current = 0;

    // Clear trajectory
    if (trajectoryRef.current) {
      trajectoryRef.current.geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(0), 3)
      );
    }
  }, [landscapeType]);

  // Handle landscape change with smooth transition
  const handleLandscapeChange = useCallback((newType: LandscapeType) => {
    if (!sceneRef.current || isTransitioning) return;
    
    setIsTransitioning(true);
    setLandscapeType(newType);

    // Morph surface
    setTimeout(() => {
      if (surfaceRef.current && sceneRef.current) {
        createSurface(sceneRef.current, newType);
      }
      resetOptimization();
      setIsTransitioning(false);
    }, 300);
  }, [isTransitioning, resetOptimization]);

  // Animation loop
  const animate = useCallback(() => {
    animationFrameRef.current = requestAnimationFrame(animate);

    const delta = clockRef.current.getDelta();
    const elapsed = clockRef.current.getElapsedTime();

    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

    // Subtle camera motion
    if (!reducedMotion && playbackState === "playing") {
      const orbitRadius = 8;
      const orbitSpeed = 0.08;
      const orbitHeight = 4;
      
      cameraRef.current.position.x = Math.sin(elapsed * orbitSpeed) * orbitRadius;
      cameraRef.current.position.z = Math.cos(elapsed * orbitSpeed) * orbitRadius;
      cameraRef.current.position.y = orbitHeight + Math.sin(elapsed * orbitSpeed * 0.5) * 0.5;
      cameraRef.current.lookAt(0, 0, 0);
    }

    // Update optimization point position
    if (pointRef.current && playbackState === "playing" && phaseRef.current !== "reset") {
      const currentPos = positionRef.current;
      const targetPos = targetPosRef.current;
      const startPos = startPosRef.current;

      if (phaseRef.current === "start") {
        // Brief pause at start
        if (startTimeRef.current === 0) {
          startTimeRef.current = Date.now();
        }
        
        if (Date.now() - startTimeRef.current > 800) {
          phaseRef.current = "descent";
          startTimeRef.current = Date.now();
        }
        
        // Set initial position
        const y = evaluateLoss(currentPos.x, currentPos.z, landscapeType);
        pointRef.current.position.set(currentPos.x, y + 0.15, currentPos.z);
        
        // Add to trajectory
        trajectoryPointsRef.current.push({ x: currentPos.x, y, z: currentPos.z });
        if (trajectoryPointsRef.current.length > 200) {
          trajectoryPointsRef.current.shift();
        }
        updateTrajectory();

      } else if (phaseRef.current === "descent" || phaseRef.current === "converging") {
        const speedMult = speedMultipliers[speed];
        const learningRate = 0.015 * speedMult;
        
        // Compute gradient
        const grad = computeGradient(currentPos.x, currentPos.z, landscapeType);
        
        // Move opposite to gradient
        const stepX = -grad.gx * learningRate;
        const stepZ = -grad.gz * learningRate;
        
        // Apply movement with convergence slowing
        const distToMin = Math.sqrt(
          Math.pow(currentPos.x - targetPos.x, 2) + 
          Math.pow(currentPos.z - targetPos.z, 2)
        );
        
        const convergenceFactor = Math.max(0.1, Math.min(1, distToMin * 0.8));
        const actualStepX = stepX * convergenceFactor;
        const actualStepZ = stepZ * convergenceFactor;
        
        currentPos.x += actualStepX;
        currentPos.z += actualStepZ;
        
        // Check if converged
        if (distToMin < 0.15) {
          phaseRef.current = "minimum";
          startTimeRef.current = Date.now();
        }
        
        // Update point position
        const y = evaluateLoss(currentPos.x, currentPos.z, landscapeType);
        pointRef.current.position.set(currentPos.x, y + 0.15, currentPos.z);
        
        // Add to trajectory
        if (trajectoryPointsRef.current.length === 0 || 
            Math.abs(trajectoryPointsRef.current[trajectoryPointsRef.current.length - 1].x - currentPos.x) > 0.02 ||
            Math.abs(trajectoryPointsRef.current[trajectoryPointsRef.current.length - 1].z - currentPos.z) > 0.02) {
          trajectoryPointsRef.current.push({ x: currentPos.x, y, z: currentPos.z });
          if (trajectoryPointsRef.current.length > 300) {
            trajectoryPointsRef.current.shift();
          }
          updateTrajectory();
        }

      } else if (phaseRef.current === "minimum") {
        // Pause at minimum
        if (Date.now() - startTimeRef.current > 1500) {
          phaseRef.current = "reset";
          resetOptimization();
        }
      }
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, [landscapeType, playbackState, speed, reducedMotion, speedMultipliers, resetOptimization]);

  // Initialize position when landscape changes
  useEffect(() => {
    resetOptimization();
  }, [resetOptimization]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setPlaybackState(prev => prev === "playing" ? "paused" : "playing");
      } else if (e.code === "KeyR") {
        resetOptimization();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [resetOptimization]);

  return (
    <section id="gradient-descent" className="relative scroll-mt-20 overflow-hidden bg-black py-24 text-paper lg:py-28">
      {/* Background elements */}
      <div className="absolute inset-0 bg-grid-dark opacity-70" />
      <div className="absolute -left-48 top-0 h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.12),transparent_62%)]" />
      <div className="absolute -right-32 bottom-0 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.08),transparent_62%)]" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        {/* Section header */}
        <Reveal>
          <div className="mb-12 lg:mb-16">
            <Eyebrow className="text-pulse-400">Gradient Descent · Optimization Lab</Eyebrow>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight text-paper sm:text-4xl">
              Watch optimization in action.
              <br />
              <span className="text-pulse-300">See how models learn.</span>
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-paper/70">
              A 3D visualization of gradient descent navigating a loss landscape. The optimization point 
              follows the steepest descent path toward the minimum, demonstrating how machine learning 
              models iteratively improve.
            </p>
          </div>
        </Reveal>

        {/* Main visualization area */}
        <div className="grid gap-8 lg:grid-cols-12">
          {/* 3D Canvas - Primary focus */}
          <Reveal delay={100} className="lg:col-span-8">
            <div 
              ref={containerRef}
              className="relative aspect-[4/3] overflow-hidden rounded-xl border border-ink-800/50 bg-ink-900/50 shadow-[0_40px_100px_-40px_rgba(6,15,24,0.7)] backdrop-blur-sm lg:aspect-[16/10]"
            >
              <canvas ref={canvasRef} className="h-full w-full" />
              
              {/* Loading state overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-ink-950/80 transition-opacity duration-500 pointer-events-none">
                <div className="flex flex-col items-center gap-3">
                  <span 
                    className="spinner" 
                    style={{ borderTopColor: "var(--color-pulse-400)", borderColor: "rgba(11,26,38,0.15)" }}
                  />
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-pulse-300/70">
                    Initializing visualization...
                  </p>
                </div>
              </div>

              {/* Status indicator */}
              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-ink-700/50 bg-ink-900/70 px-3 py-1.5 backdrop-blur-sm">
                <span 
                  className={`h-2 w-2 rounded-full ${
                    playbackState === "playing" 
                      ? "bg-pulse-400 anim-breathe" 
                      : "bg-ink-500"
                  }`}
                />
                <span className="font-mono text-[10px] uppercase tracking-wide text-paper/60">
                  {phaseRef.current === "start" && "Initializing"}
                  {phaseRef.current === "descent" && "Descending"}
                  {phaseRef.current === "converging" && "Converging"}
                  {phaseRef.current === "minimum" && "Converged"}
                  {phaseRef.current === "reset" && "Resetting"}
                </span>
              </div>

              {/* Legend */}
              <div className="absolute right-4 top-4 space-y-2 rounded-lg border border-ink-700/50 bg-ink-900/70 p-3 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f4a261] shadow-[0_0_8px_rgba(244,162,97,0.6)]" />
                  <span className="font-mono text-[9px] uppercase tracking-wide text-paper/50">Optimizer</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-0.5 w-4 bg-[#f4a261]/80" />
                  <span className="font-mono text-[9px] uppercase tracking-wide text-paper/50">Trajectory</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-teal-700/80" />
                  <span className="font-mono text-[9px] uppercase tracking-wide text-paper/50">Low Loss</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-900/80" />
                  <span className="font-mono text-[9px] uppercase tracking-wide text-paper/50">High Loss</span>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Controls & Code Panel - Secondary */}
          <Reveal delay={200} className="flex flex-col gap-4 lg:col-span-4">
            {/* Landscape Selector */}
            <div className="rounded-xl border border-ink-800/50 bg-ink-900/50 p-5 backdrop-blur-sm">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-pulse-300/80">
                Loss Landscape
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {LANDSCAPES.map((l) => (
                  <button
                    key={l.type}
                    type="button"
                    onClick={() => handleLandscapeChange(l.type)}
                    disabled={isTransitioning}
                    className={`rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-wide transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                      landscapeType === l.type
                        ? "border-pulse-500 bg-pulse-500/20 text-pulse-300"
                        : "border-ink-700/50 text-ink-400 hover:border-ink-600 hover:text-paper/70"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>

              {/* Playback Controls */}
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPlaybackState(prev => prev === "playing" ? "paused" : "playing")}
                  className="flex items-center gap-2 rounded-full border border-ink-700/50 bg-ink-800/50 px-4 py-2 font-mono text-[10.5px] tracking-wide text-paper/80 transition-all hover:bg-ink-700/50 active:scale-[0.98]"
                >
                  {playbackState === "playing" ? (
                    <>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                        <rect x="1" y="1" width="3" height="8" rx="0.5" />
                        <rect x="6" y="1" width="3" height="8" rx="0.5" />
                      </svg>
                      Pause
                    </>
                  ) : (
                    <>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                        <path d="M1.5 1 L9 5 L1.5 9 Z" />
                      </svg>
                      Play
                    </>
                  )}
                </button>
                
                <button
                  type="button"
                  onClick={resetOptimization}
                  className="flex items-center gap-2 rounded-full border border-ink-700/50 bg-ink-800/50 px-4 py-2 font-mono text-[10.5px] tracking-wide text-paper/80 transition-all hover:bg-ink-700/50 active:scale-[0.98]"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                    <path d="M5 1 L5 4 M5 4 L8 4 M5 4 L2 4" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                    <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  </svg>
                  Reset
                </button>

                {/* Speed selector */}
                <div className="ml-auto flex items-center gap-1 rounded-full border border-ink-700/50 bg-ink-800/50 p-0.5">
                  {(["slow", "normal", "fast"] as Speed[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpeed(s)}
                      className={`rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-wide transition-all ${
                        speed === s
                          ? "bg-pulse-500/30 text-pulse-300"
                          : "text-ink-400 hover:text-paper/60"
                      }`}
                    >
                      {s === "slow" ? "0.5×" : s === "normal" ? "1×" : "1.8×"}
                    </button>
                  ))}
                </div>
              </div>

              <p className="mt-4 font-mono text-[9px] tracking-wide text-ink-500">
                Space: Play/Pause · R: Reset
              </p>
            </div>

            {/* Code Panel */}
            <div className="flex-1 rounded-xl border border-ink-800/50 bg-ink-900/50 p-0 backdrop-blur-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-800/50 px-4 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
                  Gradient Descent
                </p>
                <span className="h-2 w-2 rounded-full bg-pulse-400/60" />
              </div>
              <div className="overflow-x-auto p-4">
                <pre className="font-mono text-[10.5px] leading-relaxed">
                  <code className="block">
                    <span className="text-ink-500">{`// Gradient descent update`}</span>{"\n"}
                    <span className="text-purple-400/90">while</span>{" "}
                    <span className="text-ink-300">(!converged)</span>{" "}
                    <span className="text-ink-500">{`{`}</span>{"\n"}
                    {"  "}<span className="text-ink-300">θ</span>{" "}
                    <span className="text-pulse-400">-=</span>{" "}
                    <span className="text-ink-300">lr</span>{" "}
                    <span className="text-pulse-400">*</span>{" "}
                    <span className="text-ink-300">∇L(θ)</span>{"\n"}
                    <span className="text-ink-500">{`}`}</span>{"\n"}
                    {"\n"}
                    <span className="text-ink-500">{`// Where:`}</span>{"\n"}
                    <span className="text-ink-300">θ</span>{" "}
                    <span className="text-ink-500">= parameters</span>{"\n"}
                    <span className="text-ink-300">lr</span>{" "}
                    <span className="text-ink-500">= learning rate</span>{"\n"}
                    <span className="text-ink-300">∇L(θ)</span>{" "}
                    <span className="text-ink-500">= gradient</span>{"\n"}
                  </code>
                </pre>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Explanatory content */}
        <Reveal delay={300}>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-lg border border-ink-800/30 bg-ink-900/30 p-5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-pulse-400">01</span>
                <h3 className="font-display text-base font-semibold text-paper">Loss Landscape</h3>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
                The 3D surface represents the loss function. Lower regions indicate better model performance.
              </p>
            </div>
            <div className="rounded-lg border border-ink-800/30 bg-ink-900/30 p-5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-pulse-400">02</span>
                <h3 className="font-display text-base font-semibold text-paper">Gradient Following</h3>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
                The optimizer moves opposite to the gradient—the direction of steepest ascent—to minimize loss.
              </p>
            </div>
            <div className="rounded-lg border border-ink-800/30 bg-ink-900/30 p-5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-pulse-400">03</span>
                <h3 className="font-display text-base font-semibold text-paper">Convergence</h3>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
                Movement slows near the minimum as gradients approach zero, indicating convergence.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
