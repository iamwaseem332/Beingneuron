import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { usePrefersReducedMotion } from "./hooks";
import { ButtonLink, Eyebrow, Reveal } from "./ui";
import * as THREE from "three";

/* ==================== RESEARCH MODES DATA ==================== */

type ResearchMode = "gradient-descent" | "linear-regression" | "paper-graph" | "algorithm";

interface ResearchConcept {
  id: ResearchMode;
  index: number;
  title: string;
  description: string;
  code: string;
  filename: string;
}

const RESEARCH_CONCEPTS: ResearchConcept[] = [
  {
    id: "gradient-descent",
    index: 1,
    title: "Gradient Descent",
    description: "Visualize optimization",
    filename: "gradient_descent.py",
    code: `def gradient_descent(w, lr, steps=100):
    """Optimize parameters by following negative gradient."""
    for step in range(steps):
        grad = compute_gradient(w)
        w -= lr * grad
        
        if step % 10 == 0:
            loss = compute_loss(w)
            print(f"Iteration {step}: Loss = {loss:.4f}")
    
    return w`,
  },
  {
    id: "linear-regression",
    index: 2,
    title: "Linear Regression",
    description: "Fit the model",
    filename: "linear_regression.py",
    code: `def fit_linear(x, y, lr=0.01, epochs=100):
    """Fit a line to minimize squared error."""
    w, b = 0.0, 0.0
    
    for epoch in range(epochs):
        pred = w * x + b
        error = pred - y
        
        w -= lr * (error * x).mean()
        b -= lr * error.mean()
        
        mse = (error ** 2).mean()
        print(f"Epoch {epoch}: MSE = {mse:.4f}")
    
    return w, b`,
  },
  {
    id: "paper-graph",
    index: 3,
    title: "Research Paper → Graph",
    description: "Turn ideas into structure",
    filename: "paper_graph.py",
    code: `def extract_knowledge_graph(paper):
    """Transform research paper into structured graph."""
    graph = KnowledgeGraph()
    
    # Extract sections
    for section in paper.sections:
        concepts = extract_concepts(section.text)
        graph.add_nodes(concepts)
    
    # Build relationships
    for concept in graph.nodes:
        relations = find_relations(concept, paper)
        for rel in relations:
            graph.connect(concept, rel.target, rel.type)
    
    return graph`,
  },
  {
    id: "algorithm",
    index: 4,
    title: "Algorithms",
    description: "Watch computation unfold",
    filename: "binary_search.py",
    code: `def binary_search(arr, target):
    """Find target in sorted array using divide & conquer."""
    lo, hi = 0, len(arr) - 1
    
    while lo <= hi:
        mid = (lo + hi) // 2
        
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    
    return -1`,
  },
];

/* ==================== GRADIENT DESCENT 3D VISUALIZATION ==================== */

function GradientDescent3D({
  isActive,
  reducedMotion,
  onIterationChange,
  onLossChange,
}: {
  isActive: boolean;
  reducedMotion: boolean;
  onIterationChange: (iter: number) => void;
  onLossChange: (loss: number) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationRef = useRef<number>(0);
  const timeRef = useRef(0);
  
  // Optimization state
  const positionRef = useRef<{ x: number; z: number }>({ x: -2, z: -2 });
  const trajectoryRef = useRef<{ x: number; z: number }[]>([]);
  const iterationRef = useRef(0);
  
  useEffect(() => {
    if (!mountRef.current || !isActive) return;
    
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1a26);
    sceneRef.current = scene;
    
    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      100
    );
    camera.position.set(4, 3, 4);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Create loss surface (bowl-shaped)
    const surfaceSize = 5;
    const segments = 50;
    const geometry = new THREE.PlaneGeometry(surfaceSize * 2, surfaceSize * 2, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      // Bowl shape: z = x^2 + y^2 (but y is up in our rotated space)
      const y = 0.3 * (x * x + z * z);
      positions[i + 1] = y;
    }
    geometry.computeVertexNormals();
    
    const material = new THREE.MeshPhongMaterial({
      color: 0x1e384b,
      emissive: 0x0b1a26,
      emissiveIntensity: 0.2,
      side: THREE.DoubleSide,
      wireframe: false,
      transparent: true,
      opacity: 0.9,
    });
    
    const surface = new THREE.Mesh(geometry, material);
    scene.add(surface);
    
    // Wireframe overlay
    const wireGeo = new THREE.WireframeGeometry(geometry);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x35c4ae,
      transparent: true,
      opacity: 0.15,
    });
    const wireframe = new THREE.LineSegments(wireGeo, wireMat);
    scene.add(wireframe);
    
    // Grid helper
    const gridHelper = new THREE.GridHelper(10, 10, 0x5f7d92, 0x1e384b);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);
    
    // Axes
    const axesHelper = new THREE.AxesHelper(1);
    scene.add(axesHelper);
    
    // Optimization point (ball)
    const ballGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const ballMat = new THREE.MeshPhongMaterial({
      color: 0x35c4ae,
      emissive: 0x12a392,
      emissiveIntensity: 0.5,
    });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    scene.add(ball);
    
    // Trajectory line
    const trailGeo = new THREE.BufferGeometry();
    const trailMat = new THREE.LineBasicMaterial({
      color: 0x7ce4d0,
      transparent: true,
      opacity: 0.6,
    });
    const trail = new THREE.Line(trailGeo, trailMat);
    scene.add(trail);
    
    // Minimum marker
    const minGeo = new THREE.RingGeometry(0.08, 0.12, 16);
    const minMat = new THREE.MeshBasicMaterial({
      color: 0xecab42,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const minMarker = new THREE.Mesh(minGeo, minMat);
    minMarker.rotation.x = -Math.PI / 2;
    minMarker.position.y = 0.02;
    scene.add(minMarker);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(3, 5, 2);
    scene.add(directionalLight);
    
    const pointLight = new THREE.PointLight(0x35c4ae, 0.5, 10);
    pointLight.position.set(2, 2, 2);
    scene.add(pointLight);
    
    // Reset state
    positionRef.current = { x: -2, z: -2 };
    trajectoryRef.current = [{ x: -2, z: -2 }];
    iterationRef.current = 0;
    
    // Animation loop
    let lastUpdate = 0;
    const updateInterval = reducedMotion ? 500 : 80;
    
    const animate = (time: number) => {
      animationRef.current = requestAnimationFrame(animate);
      
      if (!reducedMotion) {
        // Subtle camera orbit
        const orbitSpeed = 0.0002;
        const radius = 5.5;
        camera.position.x = Math.sin(time * orbitSpeed) * radius;
        camera.position.z = Math.cos(time * orbitSpeed) * radius;
        camera.lookAt(0, 0, 0);
      }
      
      // Update optimization
      if (time - lastUpdate > updateInterval && isActive) {
        lastUpdate = time;
        
        const pos = positionRef.current;
        const lr = 0.05;
        
        // Gradient of f(x,z) = 0.3*(x^2 + z^2)
        const gradX = 0.6 * pos.x;
        const gradZ = 0.6 * pos.z;
        
        pos.x -= lr * gradX;
        pos.z -= lr * gradZ;
        
        // Calculate y on surface
        const y = 0.3 * (pos.x * pos.x + pos.z * pos.z);
        ball.position.set(pos.x, y + 0.12, pos.z);
        
        // Update trajectory
        trajectoryRef.current.push({ x: pos.x, z: pos.z });
        if (trajectoryRef.current.length > 100) {
          trajectoryRef.current.shift();
        }
        
        // Update trail geometry
        const trailPoints = trajectoryRef.current.map((p) => {
          const ty = 0.3 * (p.x * p.x + p.z * p.z);
          return new THREE.Vector3(p.x, ty + 0.01, p.z);
        });
        trail.geometry.dispose();
        trail.geometry = new THREE.BufferGeometry().setFromPoints(trailPoints);
        
        // Update iteration and loss
        iterationRef.current += 1;
        const loss = 0.3 * (pos.x * pos.x + pos.z * pos.z);
        onIterationChange(iterationRef.current);
        onLossChange(loss);
      }
      
      renderer.render(scene, camera);
    };
    
    animate(0);
    
    // Handle resize
    const handleResize = () => {
      if (!mountRef.current || !camera || !renderer) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    
    window.addEventListener("resize", handleResize);
    
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationRef.current);
      
      // Cleanup Three.js resources
      geometry.dispose();
      material.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      ballGeo.dispose();
      ballMat.dispose();
      trailGeo.dispose();
      trailMat.dispose();
      minGeo.dispose();
      minMat.dispose();
      renderer.dispose();
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [isActive, reducedMotion, onIterationChange, onLossChange]);
  
  return <div ref={mountRef} className="h-full w-full" />;
}

/* ==================== LINEAR REGRESSION VISUALIZATION ==================== */

function LinearRegressionViz({
  isActive,
  reducedMotion,
  onMSEChange,
}: {
  isActive: boolean;
  reducedMotion: boolean;
  onMSEChange: (mse: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number>(0);
  const timeRef = useRef(0);
  
  // Generate deterministic data points
  const dataPoints = useMemo(() => {
    const seed = 42;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const x = 10 + (i * 70) / 12;
      const baseY = 20 + i * 5 + Math.sin(i * 0.5) * 8;
      const noise = ((Math.sin(seed + i * 1.7) * 1000) % 10) - 5;
      points.push({ x, y: baseY + noise });
    }
    return points;
  }, []);
  
  // Animation state
  const [lineState, setLineState] = useState({ w: -0.3, b: 80, progress: 0 });
  
  useEffect(() => {
    if (!isActive) return;
    
    let frameCount = 0;
    const targetW = 0.45;
    const targetB = 35;
    
    const animate = () => {
      frameCount++;
      timeRef.current += 0.016;
      
      if (!reducedMotion && frameCount < 180) {
        const t = frameCount / 180;
        const ease = 1 - Math.pow(1 - t, 3);
        
        setLineState({
          w: -0.3 + (targetW + 0.3) * ease,
          b: 80 + (targetB - 80) * ease,
          progress: ease,
        });
      } else if (frameCount >= 180) {
        setLineState({ w: targetW, b: targetB, progress: 1 });
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, reducedMotion]);
  
  // Calculate MSE
  useEffect(() => {
    const { w, b } = lineState;
    let totalError = 0;
    dataPoints.forEach((p) => {
      const pred = w * p.x + b;
      const error = pred - p.y;
      totalError += error * error;
    });
    const mse = totalError / dataPoints.length / 100;
    onMSEChange(mse);
  }, [lineState, dataPoints, onMSEChange]);
  
  const { w, b, progress } = lineState;
  
  // Line endpoints
  const x1 = 10;
  const y1 = w * x1 + b;
  const x2 = 80;
  const y2 = w * x2 + b;
  
  return (
    <svg ref={svgRef} viewBox="0 0 400 250" className="h-full w-full">
      {/* Grid */}
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(95, 125, 146, 0.15)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="400" height="250" fill="url(#grid)" />
      
      {/* Axes */}
      <line x1="30" y1="220" x2="380" y2="220" stroke="rgba(95, 125, 146, 0.4)" strokeWidth="1.5" />
      <line x1="30" y1="220" x2="30" y2="20" stroke="rgba(95, 125, 146, 0.4)" strokeWidth="1.5" />
      
      {/* Axis labels */}
      <text x="370" y="240" fill="rgba(139, 164, 180, 0.6)" fontSize="10" fontFamily="monospace">X</text>
      <text x="15" y="30" fill="rgba(139, 164, 180, 0.6)" fontSize="10" fontFamily="monospace">Y</text>
      
      {/* Data points */}
      {dataPoints.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="rgba(124, 228, 208, 0.6)" />
          {/* Residual lines when close to convergence */}
          {progress > 0.5 && (
            <line
              x1={p.x}
              y1={p.y}
              x2={p.x}
              y2={w * p.x + b}
              stroke="rgba(236, 171, 66, 0.4)"
              strokeWidth="1"
              strokeDasharray="2 2"
              style={{ opacity: progress > 0.7 ? 0.6 : 0 }}
            />
          )}
        </g>
      ))}
      
      {/* Regression line */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#35c4ae"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      
      {/* Equation display */}
      <text x="280" y="40" fill="rgba(124, 228, 208, 0.8)" fontSize="11" fontFamily="monospace">
        y = {w.toFixed(2)}x + {b.toFixed(1)}
      </text>
    </svg>
  );
}

/* ==================== PAPER TO GRAPH VISUALIZATION ==================== */

function PaperGraphViz({ isActive }: { isActive: boolean }) {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    if (!isActive) {
      setPhase(0);
      return;
    }
    
    const timer = setInterval(() => {
      setPhase((p) => (p < 4 ? p + 1 : p));
    }, 800);
    
    return () => clearInterval(timer);
  }, [isActive]);
  
  // Node positions
  const nodes = [
    { id: "abstract", x: 200, y: 40, label: "Abstract" },
    { id: "arch", x: 120, y: 100, label: "Architecture" },
    { id: "method", x: 280, y: 100, label: "Method" },
    { id: "attention", x: 80, y: 160, label: "Attention" },
    { id: "encoder", x: 160, y: 160, label: "Encoder" },
    { id: "embedding", x: 240, y: 160, label: "Embedding" },
    { id: "output", x: 320, y: 160, label: "Output" },
  ];
  
  const edges = [
    ["abstract", "arch"],
    ["abstract", "method"],
    ["arch", "attention"],
    ["arch", "encoder"],
    ["method", "embedding"],
    ["method", "output"],
    ["attention", "encoder"],
    ["encoder", "output"],
  ];
  
  return (
    <svg viewBox="0 0 400 250" className="h-full w-full">
      {/* Background grid */}
      <defs>
        <pattern id="graphGrid" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(95, 125, 146, 0.1)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="400" height="250" fill="url(#graphGrid)" />
      
      {/* Paper representation (fades out) */}
      <g style={{ opacity: Math.max(0, 1 - phase * 0.25), transition: "opacity 0.5s" }}>
        <rect x="60" y="30" width="280" height="180" rx="4" fill="rgba(30, 56, 75, 0.5)" />
        <line x1="80" y1="55" x2="320" y2="55" stroke="rgba(139, 164, 180, 0.3)" strokeWidth="1" />
        <line x1="80" y1="75" x2="280" y2="75" stroke="rgba(139, 164, 180, 0.2)" strokeWidth="1" />
        <line x1="80" y1="90" x2="300" y2="90" stroke="rgba(139, 164, 180, 0.2)" strokeWidth="1" />
        <line x1="80" y1="105" x2="290" y2="105" stroke="rgba(139, 164, 180, 0.2)" strokeWidth="1" />
        <text x="200" y="45" textAnchor="middle" fill="rgba(139, 164, 180, 0.5)" fontSize="9" fontFamily="monospace">
          RESEARCH PAPER
        </text>
      </g>
      
      {/* Graph nodes and edges (fade in) */}
      <g style={{ opacity: Math.min(1, phase * 0.25), transition: "opacity 0.5s" }}>
        {/* Edges */}
        {edges.map(([from, to], i) => {
          const fromNode = nodes.find((n) => n.id === from);
          const toNode = nodes.find((n) => n.id === to);
          if (!fromNode || !toNode) return null;
          
          return (
            <line
              key={i}
              x1={fromNode.x}
              y1={fromNode.y + 15}
              x2={toNode.x}
              y2={toNode.y - 15}
              stroke="rgba(53, 196, 174, 0.3)"
              strokeWidth="1.5"
              markerEnd="url(#arrowhead)"
            />
          );
        })}
        
        {/* Arrow marker */}
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="rgba(53, 196, 174, 0.5)" />
          </marker>
        </defs>
        
        {/* Nodes */}
        {nodes.map((node, i) => (
          <g key={node.id} style={{ opacity: Math.min(1, (phase - Math.floor(i / 2)) * 0.4) }}>
            <circle cx={node.x} cy={node.y} r="18" fill="rgba(11, 26, 38, 0.9)" stroke="#35c4ae" strokeWidth="1.5" />
            <text
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              fill="#7ce4d0"
              fontSize="8"
              fontFamily="monospace"
            >
              {node.label}
            </text>
          </g>
        ))}
      </g>
      
      {/* Phase indicator */}
      <text x="200" y="235" textAnchor="middle" fill="rgba(139, 164, 180, 0.5)" fontSize="9" fontFamily="monospace">
        {phase === 0 && "Extracting sections..."}
        {phase === 1 && "Identifying concepts..."}
        {phase === 2 && "Building relationships..."}
        {phase === 3 && "Constructing graph..."}
        {phase >= 4 && "Knowledge graph complete"}
      </text>
    </svg>
  );
}

/* ==================== BINARY SEARCH VISUALIZATION ==================== */

function BinarySearchViz({
  isActive,
  reducedMotion,
  onStepChange,
  onFoundChange,
}: {
  isActive: boolean;
  reducedMotion: boolean;
  onStepChange: (step: number) => void;
  onFoundChange: (found: boolean) => void;
}) {
  const [state, setState] = useState({
    lo: 0,
    hi: 8,
    mid: 4,
    step: 0,
    found: false,
    comparisons: [] as number[],
  });
  
  const array = [4, 9, 13, 18, 27, 31, 42, 56, 71];
  const target = 42;
  
  useEffect(() => {
    if (!isActive) {
      setState({ lo: 0, hi: 8, mid: 4, step: 0, found: false, comparisons: [] });
      return;
    }
    
    let lo = 0;
    let hi = array.length - 1;
    let step = 0;
    const comparisons: number[] = [];
    
    const runStep = () => {
      if (lo > hi || step > 5) {
        onFoundChange(false);
        return;
      }
      
      const mid = Math.floor((lo + hi) / 2);
      comparisons.push(mid);
      
      setState({ lo, hi, mid, step: step + 1, found: false, comparisons });
      onStepChange(step + 1);
      
      if (array[mid] === target) {
        setState((s) => ({ ...s, found: true }));
        onFoundChange(true);
        return;
      }
      
      if (array[mid] < target) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
      
      if (!reducedMotion) {
        setTimeout(runStep, 900);
      }
    };
    
    if (!reducedMotion) {
      setTimeout(runStep, 500);
    } else {
      // Run all steps immediately for reduced motion
      while (lo <= hi && step < 5) {
        const mid = Math.floor((lo + hi) / 2);
        comparisons.push(mid);
        
        if (array[mid] === target) {
          setState({ lo, hi, mid, step: step + 1, found: true, comparisons });
          onStepChange(step + 1);
          onFoundChange(true);
          break;
        }
        
        if (array[mid] < target) {
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
        
        step++;
      }
      
      if (!state.found) {
        setState({ lo, hi, mid: Math.floor((lo + hi) / 2), step, found: false, comparisons });
      }
    }
  }, [isActive, reducedMotion, onStepChange, onFoundChange]);
  
  const boxWidth = 38;
  const gap = 4;
  const startX = 20;
  
  return (
    <svg viewBox="0 0 400 250" className="h-full w-full">
      {/* Background */}
      <rect width="400" height="250" fill="rgba(11, 26, 38, 0.3)" />
      
      {/* Array boxes */}
      {array.map((val, i) => {
        const x = startX + i * (boxWidth + gap);
        const isInSearchRange = i >= state.lo && i <= state.hi;
        const isMid = i === state.mid;
        const isTarget = val === target;
        const wasCompared = state.comparisons.includes(i);
        
        return (
          <g key={i}>
            <rect
              x={x}
              y="100"
              width={boxWidth}
              height="50"
              rx="4"
              fill={
                isMid
                  ? "rgba(53, 196, 174, 0.3)"
                  : !isInSearchRange
                  ? "rgba(30, 56, 75, 0.3)"
                  : "rgba(30, 56, 75, 0.6)"
              }
              stroke={
                isTarget && state.found
                  ? "#35c4ae"
                  : isMid
                  ? "#35c4ae"
                  : wasCompared
                  ? "rgba(95, 125, 146, 0.5)"
                  : "rgba(95, 125, 146, 0.3)"
              }
              strokeWidth={isMid || (isTarget && state.found) ? 2 : 1}
              style={{
                opacity: isInSearchRange ? 1 : 0.4,
                transition: "all 0.3s ease",
              }}
            />
            <text
              x={x + boxWidth / 2}
              y="128"
              textAnchor="middle"
              fill={isTarget && state.found ? "#35c4ae" : "#7ce4d0"}
              fontSize="14"
              fontFamily="monospace"
              fontWeight="600"
            >
              {val}
            </text>
            <text
              x={x + boxWidth / 2}
              y="165"
              textAnchor="middle"
              fill="rgba(139, 164, 180, 0.5)"
              fontSize="9"
              fontFamily="monospace"
            >
              [{i}]
            </text>
          </g>
        );
      })}
      
      {/* Mid pointer */}
      {!state.found && (
        <g>
          <polygon
            points={`${startX + state.mid * (boxWidth + gap) + boxWidth / 2},85 ${startX + state.mid * (boxWidth + gap) + boxWidth / 2 - 6},95 ${startX + state.mid * (boxWidth + gap) + boxWidth / 2 + 6},95`}
            fill="#ecab42"
          />
          <text
            x={startX + state.mid * (boxWidth + gap) + boxWidth / 2}
            y="80"
            textAnchor="middle"
            fill="#ecab42"
            fontSize="9"
            fontFamily="monospace"
          >
            mid
          </text>
        </g>
      )}
      
      {/* Found indicator */}
      {state.found && (
        <g>
          <circle
            cx={startX + state.mid * (boxWidth + gap) + boxWidth / 2}
            cy="125"
            r="35"
            fill="none"
            stroke="#35c4ae"
            strokeWidth="2"
            strokeDasharray="4 4"
          >
            <animateTransform
              attributeName="transform"
              type="scale"
              values="1;1.1;1"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </circle>
        </g>
      )}
      
      {/* Target display */}
      <text x="200" y="40" textAnchor="middle" fill="rgba(139, 164, 180, 0.7)" fontSize="11" fontFamily="monospace">
        target = <tspan fill="#35c4ae">{target}</tspan>
      </text>
      
      {/* Status */}
      <text x="200" y="220" textAnchor="middle" fill="rgba(139, 164, 180, 0.6)" fontSize="10" fontFamily="monospace">
        {state.found ? (
          <tspan fill="#35c4ae">FOUND at index {state.mid}</tspan>
        ) : (
          `Step ${state.step} — searching...`
        )}
      </text>
    </svg>
  );
}

/* ==================== CODE PANEL WITH SYNTAX HIGHLIGHTING ==================== */

function CodePanel({ code, activeLine }: { code: string; activeLine: number }) {
  const lines = code.split("\n");
  
  return (
    <div className="overflow-x-auto">
      <pre className="font-mono text-[11px] leading-relaxed">
        {lines.map((line, i) => {
          // Simple syntax highlighting
          const highlighted = line
            .replace(/^(def|for|if|else|elif|while|return|import|from|class)\b/g, "<span class=\"text-[#ecab42]\">$1</span>")
            .replace(/\b(range|len|print|mean|int|str|float)\b/g, "<span class=\"text-[#7ce4d0]\">$1</span>")
            .replace(/(""".*?"""|'.*?'|".*?")/g, "<span class=\"text-[#8ba4b4]\">$1</span>")
            .replace(/(#.*)$/gm, "<span class=\"text-ink-400\">$1</span>")
            .replace(/\b(\d+)\b/g, "<span class=\"text-[#f4c579]\">$1</span>")
            .replace(/\b(True|False|None)\b/g, "<span class=\"text-[#ecab42]\">$1</span>")
            .replace(/self\./g, "<span class=\"text-[#f4c579]\">self.</span>");
          
          const isActive = i + 1 === activeLine;
          
          return (
            <div
              key={i}
              className={`flex ${isActive ? "bg-pulse-500/10" : ""}`}
              style={{
                borderLeft: isActive ? "2px solid #35c4ae" : "2px solid transparent",
                paddingLeft: isActive ? "10px" : "12px",
              }}
            >
              <span className="select-none pr-3 text-ink-400/50">{String(i + 1).padStart(2, " ")}</span>
              <code
                className="text-paper/85"
                dangerouslySetInnerHTML={{ __html: highlighted || " " }}
              />
            </div>
          );
        })}
      </pre>
    </div>
  );
}

/* ==================== MAIN RESEARCH LOOP SECTION ==================== */

export default function ResearchLoopSection() {
  const reducedMotion = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  // Visualization state
  const [iteration, setIteration] = useState(0);
  const [loss, setLoss] = useState(0);
  const [mse, setMse] = useState(0);
  const [algoStep, setAlgoStep] = useState(0);
  const [algoFound, setAlgoFound] = useState(false);
  
  const activeConcept = RESEARCH_CONCEPTS[activeIndex];
  const totalConcepts = RESEARCH_CONCEPTS.length;
  
  // Auto-loop through concepts
  useEffect(() => {
    if (reducedMotion || isPaused) return;
    
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % totalConcepts);
    }, 8000);
    
    return () => clearInterval(interval);
  }, [reducedMotion, isPaused, totalConcepts]);
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setIsPaused(true);
        setActiveIndex((prev) => {
          if (e.key === "ArrowUp") {
            return prev === 0 ? totalConcepts - 1 : prev - 1;
          }
          return prev === totalConcepts - 1 ? 0 : prev + 1;
        });
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setIsPaused((p) => !p);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [totalConcepts]);
  
  const handleSelect = useCallback((index: number) => {
    setActiveIndex(index);
    setIsPaused(true);
  }, []);
  
  // Determine active line for code highlighting based on concept
  const getActiveCodeLine = () => {
    switch (activeConcept.id) {
      case "gradient-descent":
        return Math.min(4 + (iteration % 3), 7);
      case "linear-regression":
        return Math.min(5 + (Math.floor(iteration / 2) % 3), 10);
      case "paper-graph":
        return Math.min(4 + (iteration % 4), 12);
      case "algorithm":
        return algoStep > 0 ? 6 + Math.min(algoStep, 4) : 4;
      default:
        return 1;
    }
  };
  
  return (
    <section
      ref={containerRef}
      className="relative overflow-hidden bg-[#050a08] py-24 lg:py-32"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background elements */}
      <div className="bg-grid-dark absolute inset-0 opacity-50" />
      <div className="absolute -right-40 -top-40 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.04),transparent_65%)]" />
      <div className="absolute -left-40 bottom-0 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.03),transparent_60%)]" />
      
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        {/* Section header */}
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow className="justify-center text-pulse-300">From Paper to Understanding</Eyebrow>
            <h2 className="mt-5 font-display text-3xl font-semibold leading-[1.06] tracking-tight text-paper sm:text-4xl lg:text-[2.75rem]">
              See how intelligence is built.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-paper/65">
              Explore the mathematics, algorithms, and architectures hidden inside modern machine-learning research.
            </p>
          </div>
        </Reveal>
        
        {/* Main loop interface */}
        <div className="mt-16 grid gap-8 lg:grid-cols-[32%_68%]">
          {/* Left navigation */}
          <Reveal delay={100}>
            <nav className="relative" aria-label="Research concepts">
              {/* Progress line */}
              <div className="absolute left-[19px] top-4 bottom-4 w-[1px] bg-gradient-to-b from-transparent via-ink-400/30 to-transparent" />
              
              <ul className="space-y-6">
                {RESEARCH_CONCEPTS.map((concept, i) => {
                  const isActive = i === activeIndex;
                  const isHovered = i === hoveredIndex;
                  
                  return (
                    <li key={concept.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(i)}
                        onMouseEnter={() => setHoveredIndex(i)}
                        onMouseLeave={() => setHoveredIndex(null)}
                        className={`group flex w-full items-start gap-4 text-left transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-pulse-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050a08] rounded-lg p-2 -ml-2 ${
                          isActive ? "opacity-100" : isHovered ? "opacity-80" : "opacity-45"
                        }`}
                        aria-current={isActive ? "step" : undefined}
                      >
                        {/* Progress indicator */}
                        <div className="relative mt-1 flex h-5 w-5 shrink-0 items-center justify-center">
                          <div
                            className={`h-2.5 w-2.5 rounded-full transition-all duration-500 ${
                              isActive
                                ? "bg-[#35c4ae] shadow-[0_0_12px_rgba(53,196,174,0.6)]"
                                : isHovered
                                ? "bg-ink-300"
                                : "bg-ink-400/40"
                            }`}
                          />
                          {isActive && !reducedMotion && (
                            <div className="absolute inset-0 animate-ping rounded-full bg-pulse-400/20" />
                          )}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 pt-0.5">
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono text-[10px] uppercase tracking-wider text-ink-400">
                              {String(concept.index).padStart(2, "0")}
                            </span>
                          </div>
                          <h3
                            className={`mt-1 font-display text-lg font-medium tracking-tight transition-colors ${
                              isActive ? "text-paper" : "text-ink-300 group-hover:text-paper"
                            }`}
                          >
                            {concept.title}
                          </h3>
                          <p className="mt-1 text-sm text-ink-400">{concept.description}</p>
                          
                          {/* Progress bar for auto-advance */}
                          {isActive && !isPaused && !reducedMotion && (
                            <div className="mt-2 h-[1px] w-full overflow-hidden bg-ink-800">
                              <div
                                className="h-full bg-pulse-500/60"
                                style={{
                                  width: "100%",
                                  animation: "progressFill 8s linear",
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </Reveal>
          
          {/* Right visualization workspace */}
          <Reveal delay={200}>
            <div className="relative overflow-hidden rounded-2xl border border-ink-800/60 bg-[#0b1a26]/80 backdrop-blur-sm">
              {/* Top bar */}
              <div className="flex items-center justify-between border-b border-ink-800/60 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ecab42]/60" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#f4c579]/60" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#35c4ae]/60" />
                  </div>
                  <span className="font-mono text-[11px] text-ink-300">{activeConcept.filename}</span>
                </div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-ink-400">
                  {String(activeIndex + 1).padStart(2, "0")} / {String(totalConcepts).padStart(2, "0")}
                </div>
              </div>
              
              {/* Visualization area */}
              <div className="h-[320px] sm:h-[380px] lg:h-[420px]">
                {activeConcept.id === "gradient-descent" && (
                  <GradientDescent3D
                    isActive={activeIndex === 0}
                    reducedMotion={reducedMotion}
                    onIterationChange={setIteration}
                    onLossChange={setLoss}
                  />
                )}
                
                {activeConcept.id === "linear-regression" && (
                  <LinearRegressionViz
                    isActive={activeIndex === 1}
                    reducedMotion={reducedMotion}
                    onMSEChange={setMse}
                  />
                )}
                
                {activeConcept.id === "paper-graph" && (
                  <PaperGraphViz isActive={activeIndex === 2} />
                )}
                
                {activeConcept.id === "algorithm" && (
                  <BinarySearchViz
                    isActive={activeIndex === 3}
                    reducedMotion={reducedMotion}
                    onStepChange={setAlgoStep}
                    onFoundChange={setAlgoFound}
                  />
                )}
              </div>
              
              {/* Metadata overlay */}
              <div className="absolute bottom-4 right-4 flex gap-4 rounded-lg border border-ink-800/60 bg-[#0b1a26]/90 px-3 py-2 backdrop-blur-sm">
                {activeConcept.id === "gradient-descent" && (
                  <>
                    <div className="text-right">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-ink-400">Iteration</div>
                      <div className="font-mono text-sm text-pulse-300">{iteration}</div>
                    </div>
                    <div className="h-8 w-[1px] bg-ink-800" />
                    <div className="text-right">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-ink-400">Loss</div>
                      <div className="font-mono text-sm text-pulse-300">{loss.toFixed(4)}</div>
                    </div>
                    <div className="h-8 w-[1px] bg-ink-800" />
                    <div className="text-right">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-ink-400">LR</div>
                      <div className="font-mono text-sm text-pulse-300">0.05</div>
                    </div>
                  </>
                )}
                
                {activeConcept.id === "linear-regression" && (
                  <>
                    <div className="text-right">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-ink-400">MSE</div>
                      <div className="font-mono text-sm text-pulse-300">{mse.toFixed(3)}</div>
                    </div>
                    <div className="h-8 w-[1px] bg-ink-800" />
                    <div className="text-right">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-ink-400">Samples</div>
                      <div className="font-mono text-sm text-pulse-300">12</div>
                    </div>
                  </>
                )}
                
                {activeConcept.id === "paper-graph" && (
                  <>
                    <div className="text-right">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-ink-400">Nodes</div>
                      <div className="font-mono text-sm text-pulse-300">7</div>
                    </div>
                    <div className="h-8 w-[1px] bg-ink-800" />
                    <div className="text-right">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-ink-400">Edges</div>
                      <div className="font-mono text-sm text-pulse-300">8</div>
                    </div>
                  </>
                )}
                
                {activeConcept.id === "algorithm" && (
                  <>
                    <div className="text-right">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-ink-400">Steps</div>
                      <div className="font-mono text-sm text-pulse-300">{algoStep || "-"}</div>
                    </div>
                    <div className="h-8 w-[1px] bg-ink-800" />
                    <div className="text-right">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-ink-400">Status</div>
                      <div className={`font-mono text-sm ${algoFound ? "text-[#35c4ae]" : "text-ink-300"}`}>
                        {algoFound ? "FOUND" : "SEARCHING"}
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              {/* Code panel */}
              <div className="border-t border-ink-800/60 bg-[#060f18]/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-400">Code</span>
                  <span className="font-mono text-[9px] text-ink-500">Python</span>
                </div>
                <CodePanel code={activeConcept.code} activeLine={getActiveCodeLine()} />
              </div>
            </div>
          </Reveal>
        </div>
        
        {/* Keyboard hint */}
        <Reveal delay={350}>
          <p className="mt-8 text-center font-mono text-[10.5px] tracking-wide text-ink-400/50">
            Use arrow keys to navigate · Space to pause/resume
          </p>
        </Reveal>
      </div>
      
      {/* CSS for progress animation */}
      <style>{`
        @keyframes progressFill {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </section>
  );
}
