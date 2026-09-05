import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { usePrefersReducedMotion } from "./hooks";
import { ButtonLink, Eyebrow, Reveal } from "./ui";
import { IconArrowRight, IconChevron } from "./icons";

/* ==================== ALGORITHM DATA ==================== */

type AlgorithmCategory = 
  | "Foundations"
  | "Search"
  | "Sorting"
  | "Graph"
  | "Optimization"
  | "Machine Learning"
  | "Deep Learning";

interface Algorithm {
  id: string;
  name: string;
  category: AlgorithmCategory;
  shortDescription: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  visualType: "linear" | "binary" | "iterative" | "graph" | "gradient" | "network";
  route?: string;
}

const ALGORITHMS: Algorithm[] = [
  // Foundations
  {
    id: "linear-search",
    name: "Linear Search",
    category: "Foundations",
    shortDescription: "Sequentially check each element until target is found.",
    difficulty: "Beginner",
    visualType: "linear",
    route: "/algorithms/linear-search",
  },
  {
    id: "binary-search",
    name: "Binary Search",
    category: "Search",
    shortDescription: "Divide and conquer on sorted data—halve the search space each step.",
    difficulty: "Beginner",
    visualType: "binary",
    route: "/algorithms/binary-search",
  },
  // Sorting
  {
    id: "bubble-sort",
    name: "Bubble Sort",
    category: "Sorting",
    shortDescription: "Repeatedly swap adjacent elements if out of order.",
    difficulty: "Beginner",
    visualType: "iterative",
    route: "/algorithms/bubble-sort",
  },
  {
    id: "merge-sort",
    name: "Merge Sort",
    category: "Sorting",
    shortDescription: "Divide array, sort recursively, then merge sorted halves.",
    difficulty: "Intermediate",
    visualType: "iterative",
    route: "/algorithms/merge-sort",
  },
  {
    id: "quick-sort",
    name: "Quick Sort",
    category: "Sorting",
    shortDescription: "Pick a pivot, partition around it, recurse on subarrays.",
    difficulty: "Intermediate",
    visualType: "iterative",
    route: "/algorithms/quick-sort",
  },
  // Graph
  {
    id: "bfs",
    name: "Breadth-First Search",
    category: "Graph",
    shortDescription: "Explore neighbors level by level using a queue.",
    difficulty: "Intermediate",
    visualType: "graph",
    route: "/algorithms/bfs",
  },
  {
    id: "dfs",
    name: "Depth-First Search",
    category: "Graph",
    shortDescription: "Go deep first, backtrack when stuck—uses a stack.",
    difficulty: "Intermediate",
    visualType: "graph",
    route: "/algorithms/dfs",
  },
  {
    id: "dijkstra",
    name: "Dijkstra's Algorithm",
    category: "Graph",
    shortDescription: "Find shortest paths from source using greedy relaxation.",
    difficulty: "Advanced",
    visualType: "graph",
    route: "/algorithms/dijkstra",
  },
  {
    id: "astar",
    name: "A* Search",
    category: "Graph",
    shortDescription: "Heuristic-guided pathfinding—combines cost and estimate.",
    difficulty: "Advanced",
    visualType: "graph",
    route: "/algorithms/astar",
  },
  // Optimization
  {
    id: "kruskal",
    name: "Kruskal's Algorithm",
    category: "Graph",
    shortDescription: "Build minimum spanning tree by adding cheapest edges.",
    difficulty: "Advanced",
    visualType: "graph",
    route: "/algorithms/kruskal",
  },
  {
    id: "gradient-descent",
    name: "Gradient Descent",
    category: "Optimization",
    shortDescription: "Iteratively move toward minimum by following negative gradient.",
    difficulty: "Intermediate",
    visualType: "gradient",
    route: "/algorithms/gradient-descent",
  },
  // Machine Learning
  {
    id: "kmeans",
    name: "K-Means Clustering",
    category: "Machine Learning",
    shortDescription: "Partition data into K clusters by minimizing within-cluster variance.",
    difficulty: "Intermediate",
    visualType: "iterative",
    route: "/algorithms/kmeans",
  },
  {
    id: "linear-regression",
    name: "Linear Regression",
    category: "Machine Learning",
    shortDescription: "Fit a line to minimize squared error between predictions and targets.",
    difficulty: "Beginner",
    visualType: "gradient",
    route: "/algorithms/linear-regression",
  },
  {
    id: "logistic-regression",
    name: "Logistic Regression",
    category: "Machine Learning",
    shortDescription: "Model binary outcomes using sigmoid function.",
    difficulty: "Intermediate",
    visualType: "gradient",
    route: "/algorithms/logistic-regression",
  },
  {
    id: "decision-tree",
    name: "Decision Tree",
    category: "Machine Learning",
    shortDescription: "Split data recursively based on feature thresholds.",
    difficulty: "Intermediate",
    visualType: "graph",
    route: "/algorithms/decision-tree",
  },
  // Deep Learning
  {
    id: "perceptron",
    name: "Perceptron",
    category: "Deep Learning",
    shortDescription: "Single-layer neural unit—foundation of deep learning.",
    difficulty: "Beginner",
    visualType: "network",
    route: "/algorithms/perceptron",
  },
  {
    id: "backpropagation",
    name: "Backpropagation",
    category: "Deep Learning",
    shortDescription: "Compute gradients through network layers via chain rule.",
    difficulty: "Advanced",
    visualType: "network",
    route: "/algorithms/backpropagation",
  },
];

const CATEGORY_COLORS: Record<AlgorithmCategory, number> = {
  Foundations: 0x5f7d92,
  Search: 0x12a392,
  Sorting: 0x35c4ae,
  Graph: 0x7ce4d0,
  Optimization: 0xecab42,
  "Machine Learning": 0x12a392,
  "Deep Learning": 0x0c8377,
};

/* ==================== VISUAL PREVIEW COMPONENT ==================== */

function AlgorithmVisual({
  visualType,
  isActive,
  reducedMotion,
}: {
  visualType: Algorithm["visualType"];
  isActive: boolean;
  reducedMotion: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const animate = () => {
      if (!reducedMotion) {
        timeRef.current += 0.02;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(11, 26, 38, 0.3)";
      ctx.fillRect(0, 0, width, height);

      const t = timeRef.current;

      switch (visualType) {
        case "linear": {
          // Simple scanning line
          const barCount = 8;
          const barWidth = width / barCount - 4;
          const scanPos = reducedMotion ? width / 2 : ((t * 30) % width);
          
          for (let i = 0; i < barCount; i++) {
            const x = i * (barWidth + 4) + 2;
            const isScanned = x < scanPos;
            ctx.fillStyle = isScanned ? "#35c4ae" : "rgba(95, 125, 146, 0.4)";
            ctx.fillRect(x, height / 2 - 15, barWidth, 30);
          }
          
          // Scan indicator
          ctx.strokeStyle = "#12a392";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(scanPos, 10);
          ctx.lineTo(scanPos, height - 10);
          ctx.stroke();
          break;
        }

        case "binary": {
          // Binary tree visualization
          const levels = 3;
          const nodeRadius = 6;
          
          const drawNode = (x: number, y: number, level: number, active: boolean) => {
            ctx.beginPath();
            ctx.arc(x, y, nodeRadius, 0, Math.PI * 2);
            ctx.fillStyle = active ? "#35c4ae" : "rgba(95, 125, 146, 0.5)";
            ctx.fill();
          };

          const positions = [
            { x: width / 2, y: 25, level: 0 },
            { x: width / 4, y: 45, level: 1 },
            { x: (width * 3) / 4, y: 45, level: 1 },
          ];

          // Draw connections
          ctx.strokeStyle = "rgba(95, 125, 146, 0.3)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(width / 2, 25);
          ctx.lineTo(width / 4, 45);
          ctx.moveTo(width / 2, 25);
          ctx.lineTo((width * 3) / 4, 45);
          ctx.stroke();

          // Highlight active path
          const activeIndex = reducedMotion ? 0 : Math.floor(t * 2) % 3;
          positions.forEach((pos, i) => {
            drawNode(pos.x, pos.y, pos.level, i === activeIndex);
          });
          break;
        }

        case "iterative": {
          // Bars being sorted
          const barCount = 6;
          const barWidth = (width - barCount * 2) / barCount;
          
          for (let i = 0; i < barCount; i++) {
            const baseHeight = 15 + i * 8;
            const variation = reducedMotion ? 0 : Math.sin(t * 3 + i * 1.5) * 5;
            const height = baseHeight + variation;
            
            const hue = i / barCount;
            ctx.fillStyle = `hsla(${180 + hue * 40}, 70%, ${45 + variation}%, 0.8)`;
            ctx.fillRect(i * (barWidth + 2) + 1, height - 10, barWidth, height);
          }
          break;
        }

        case "graph": {
          // Network nodes
          const nodes = [
            { x: width * 0.3, y: height * 0.3 },
            { x: width * 0.7, y: height * 0.25 },
            { x: width * 0.5, y: height * 0.55 },
            { x: width * 0.25, y: height * 0.7 },
            { x: width * 0.75, y: height * 0.7 },
          ];

          // Draw edges
          ctx.strokeStyle = "rgba(95, 125, 146, 0.3)";
          ctx.lineWidth = 1;
          const edges = [[0, 1], [0, 2], [1, 2], [2, 3], [2, 4], [3, 4]];
          
          edges.forEach(([a, b]) => {
            ctx.beginPath();
            ctx.moveTo(nodes[a].x, nodes[a].y);
            ctx.lineTo(nodes[b].x, nodes[b].y);
            ctx.stroke();
          });

          // Draw nodes with pulse effect
          const activeNode = reducedMotion ? 2 : Math.floor(t * 1.5) % nodes.length;
          nodes.forEach((node, i) => {
            const isActive = i === activeNode;
            ctx.beginPath();
            ctx.arc(node.x, node.y, isActive ? 8 : 5, 0, Math.PI * 2);
            ctx.fillStyle = isActive ? "#35c4ae" : "rgba(95, 125, 146, 0.5)";
            ctx.fill();
            
            if (isActive && !reducedMotion) {
              ctx.strokeStyle = "rgba(53, 196, 174, 0.4)";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(node.x, node.y, 12 + Math.sin(t * 4) * 2, 0, Math.PI * 2);
              ctx.stroke();
            }
          });
          break;
        }

        case "gradient": {
          // Gradient descent curve
          ctx.strokeStyle = "#35c4ae";
          ctx.lineWidth = 2;
          ctx.beginPath();
          
          for (let x = 10; x < width - 10; x++) {
            const normalizedX = (x - 10) / (width - 20);
            const y = 15 + Math.pow(normalizedX - 0.3, 2) * 40;
            if (x === 10) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();

          // Moving point
          const pointX = reducedMotion ? width * 0.3 : 10 + ((t * 20) % (width - 20));
          const normalizedX = (pointX - 10) / (width - 20);
          const pointY = 15 + Math.pow(normalizedX - 0.3, 2) * 40;
          
          ctx.beginPath();
          ctx.arc(pointX, pointY, 5, 0, Math.PI * 2);
          ctx.fillStyle = "#f4a261";
          ctx.fill();
          break;
        }

        case "network": {
          // Neural network layers
          const layers = [3, 4, 2];
          const layerSpacing = width / (layers.length + 1);
          
          layers.forEach((neuronCount, layerIndex) => {
            const x = layerSpacing * (layerIndex + 1);
            const neuronSpacing = height / (neuronCount + 1);
            
            for (let i = 0; i < neuronCount; i++) {
              const y = neuronSpacing * (i + 1);
              const isNeuronActive = isActive && !reducedMotion && Math.sin(t * 5 + layerIndex + i) > 0.5;
              
              ctx.beginPath();
              ctx.arc(x, y, isNeuronActive ? 6 : 4, 0, Math.PI * 2);
              ctx.fillStyle = isNeuronActive ? "#35c4ae" : "rgba(95, 125, 146, 0.6)";
              ctx.fill();
            }
          });

          // Connections
          ctx.strokeStyle = "rgba(95, 125, 146, 0.2)";
          ctx.lineWidth = 1;
          let prevX = layerSpacing;
          let prevCount = layers[0];
          
          for (let l = 1; l < layers.length; l++) {
            const currX = layerSpacing * (l + 1);
            const currCount = layers[l];
            const prevSpacing = height / (prevCount + 1);
            const currSpacing = height / (currCount + 1);
            
            for (let i = 0; i < prevCount; i++) {
              for (let j = 0; j < currCount; j++) {
                ctx.beginPath();
                ctx.moveTo(prevX, prevSpacing * (i + 1));
                ctx.lineTo(currX, currSpacing * (j + 1));
                ctx.stroke();
              }
            }
            prevX = currX;
            prevCount = currCount;
          }
          break;
        }
      }
    };

    const loop = () => {
      animate();
      animationRef.current = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [visualType, isActive, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      width={180}
      height={80}
      className="w-full h-full"
      aria-hidden
    />
  );
}

/* ==================== ORBIT NODE ==================== */

interface OrbitNodeProps {
  algorithm: Algorithm;
  index: number;
  total: number;
  isActive: boolean;
  isHovered: boolean;
  angle: number;
  radiusX: number;
  radiusY: number;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  reducedMotion: boolean;
}

function OrbitNode({
  algorithm,
  index,
  total,
  isActive,
  isHovered,
  angle,
  radiusX,
  radiusY,
  onSelect,
  onHover,
  reducedMotion,
}: OrbitNodeProps) {
  // Calculate position on elliptical orbit
  const x = Math.cos(angle) * radiusX;
  const y = Math.sin(angle) * radiusY;
  
  // Depth effect: scale based on z-position (simulated by y)
  const depthFactor = 0.5 + 0.5 * Math.sin(angle + Math.PI / 2);
  const scale = isActive ? 1.3 : isHovered ? 1.15 : 0.7 + 0.3 * depthFactor;
  const opacity = isActive ? 1 : isHovered ? 0.9 : 0.5 + 0.4 * depthFactor;
  
  const categoryColor = CATEGORY_COLORS[algorithm.category];
  const hexColor = `#${categoryColor.toString(16).padStart(6, "0")}`;

  return (
    <button
      type="button"
      className={`absolute flex items-center justify-center transition-all duration-500 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-pulse-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded-full`}
      style={{
        left: `calc(50% + ${x}px)`,
        top: `calc(50% + ${y}px)`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
        zIndex: isActive ? 50 : Math.floor(depthFactor * 10),
      }}
      onClick={() => onSelect(algorithm.id)}
      onMouseEnter={() => onHover(algorithm.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(algorithm.id)}
      onBlur={() => onHover(null)}
      aria-label={`${algorithm.name}${isActive ? " (active)" : ""}`}
      aria-current={isActive ? "true" : undefined}
    >
      {/* Node circle */}
      <div
        className={`relative flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
          isActive
            ? "h-14 w-14 border-pulse-400 bg-black shadow-[0_0_30px_rgba(53,196,174,0.4)]"
            : "h-8 w-8 border-opacity-40 bg-black"
        }`}
        style={{
          borderColor: isActive || isHovered ? hexColor : `rgba(95, 125, 146, 0.4)`,
        }}
      >
        {/* Inner dot */}
        <div
          className={`rounded-full transition-all duration-300 ${
            isActive ? "h-4 w-4" : "h-2 w-2"
          }`}
          style={{
            backgroundColor: isActive || isHovered ? hexColor : "#5f7d92",
          }}
        />
        
        {/* Active glow ring */}
        {isActive && !reducedMotion && (
          <div className="absolute inset-0 animate-ping rounded-full bg-pulse-400 opacity-20" />
        )}
      </div>
      
      {/* Label - only show for active or hovered nodes, or nodes in front */}
      {(isActive || isHovered || depthFactor > 0.7) && (
        <span
          className={`absolute top-full mt-2 whitespace-nowrap font-mono text-[10px] tracking-wide transition-all duration-300 ${
            isActive ? "text-pulse-300" : "text-paper/60"
          }`}
          style={{
            opacity: isActive ? 1 : 0.7,
          }}
        >
          {algorithm.name}
        </span>
      )}
    </button>
  );
}

/* ==================== MAIN COMPONENT ==================== */

export default function AlgorithmsLoopSection() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  
  const [activeId, setActiveId] = useState<string>(ALGORITHMS[0].id);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [rotationOffset, setRotationOffset] = useState(0);
  
  const activeIndex = useMemo(
    () => ALGORITHMS.findIndex((a) => a.id === activeId),
    [activeId]
  );
  const activeAlgorithm = ALGORITHMS[activeIndex];

  // Auto-rotation
  useEffect(() => {
    if (reducedMotion || isPaused) return;

    const interval = setInterval(() => {
      setRotationOffset((prev) => prev + 0.003);
    }, 50);

    return () => clearInterval(interval);
  }, [reducedMotion, isPaused]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = activeIndex === 0 ? ALGORITHMS.length - 1 : activeIndex - 1;
        setActiveId(ALGORITHMS[prevIndex].id);
        setIsPaused(true);
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = activeIndex === ALGORITHMS.length - 1 ? 0 : activeIndex + 1;
        setActiveId(ALGORITHMS[nextIndex].id);
        setIsPaused(true);
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setIsPaused((p) => !p);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex]);

  // Pause on hover
  const handleInteractionStart = useCallback(() => {
    setIsPaused(true);
  }, []);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setIsPaused(true);
  }, []);

  const handleHover = useCallback((id: string | null) => {
    setHoveredId(id);
  }, []);

  const goToPrevious = useCallback(() => {
    const prevIndex = activeIndex === 0 ? ALGORITHMS.length - 1 : activeIndex - 1;
    setActiveId(ALGORITHMS[prevIndex].id);
    setIsPaused(true);
  }, [activeIndex]);

  const goToNext = useCallback(() => {
    const nextIndex = activeIndex === ALGORITHMS.length - 1 ? 0 : activeIndex + 1;
    setActiveId(ALGORITHMS[nextIndex].id);
    setIsPaused(true);
  }, [activeIndex]);

  // Calculate node angles
  const getNodeAngle = useCallback(
    (index: number) => {
      const baseAngle = (index / ALGORITHMS.length) * Math.PI * 2;
      // Adjust so active node is at the front (bottom of ellipse)
      const activeAngle = (activeIndex / ALGORITHMS.length) * Math.PI * 2;
      const offset = -activeAngle + Math.PI / 2 + rotationOffset;
      return baseAngle + offset;
    },
    [activeIndex, rotationOffset]
  );

  return (
    <section
      id="algorithms-loop"
      className="relative scroll-mt-20 overflow-hidden bg-black py-24 text-paper lg:py-32"
      ref={containerRef}
      onMouseEnter={handleInteractionStart}
      onTouchStart={handleInteractionStart}
    >
      {/* Background grid */}
      <div className="bg-grid-dark absolute inset-0 opacity-70" />
      
      {/* Subtle radial glow */}
      <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.08),transparent_65%)]" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        {/* Section header */}
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow className="text-pulse-300">Algorithm Exploration</Eyebrow>
            <h2 className="mt-5 font-display text-3xl font-semibold leading-[1.06] tracking-tight text-paper sm:text-4xl lg:text-[2.75rem]">
              Explore algorithms through an interactive{" "}
              <span className="text-pulse-300">computational orbit</span>.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-paper/65">
              Navigate a continuous loop of fundamental algorithms—from search and sorting to
              machine learning and deep learning. Each node represents a pathway into computational thinking.
            </p>
          </div>
        </Reveal>

        {/* Main orbit visualization */}
        <Reveal delay={150}>
          <div className="relative mt-16 h-[520px] sm:h-[600px] lg:h-[680px]">
            {/* Orbit path */}
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 800 600"
              aria-hidden
            >
              <defs>
                <ellipse
                  id="orbit-path"
                  cx="400"
                  cy="300"
                  rx="320"
                  ry="220"
                  fill="none"
                  stroke="url(#orbit-gradient)"
                  strokeWidth="1.5"
                  strokeDasharray="4 8"
                  opacity="0.3"
                />
                <linearGradient id="orbit-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#5f7d92" stopOpacity="0.2" />
                  <stop offset="50%" stopColor="#35c4ae" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#5f7d92" stopOpacity="0.2" />
                </linearGradient>
              </defs>
              <use href="#orbit-path" />
              
              {/* Animated segment */}
              {!reducedMotion && (
                <ellipse
                  cx="400"
                  cy="300"
                  rx="320"
                  ry="220"
                  fill="none"
                  stroke="#35c4ae"
                  strokeWidth="2"
                  strokeDasharray="20 580"
                  strokeDashoffset={-rotationOffset * 100}
                  opacity="0.6"
                />
              )}
            </svg>

            {/* Algorithm nodes */}
            <div className="absolute inset-0 flex items-center justify-center">
              {ALGORITHMS.map((algo, index) => {
                const angle = getNodeAngle(index);
                const isActive = algo.id === activeId;
                const isHovered = algo.id === hoveredId;
                
                return (
                  <OrbitNode
                    key={algo.id}
                    algorithm={algo}
                    index={index}
                    total={ALGORITHMS.length}
                    isActive={isActive}
                    isHovered={isHovered}
                    angle={angle}
                    radiusX={window.innerWidth >= 1024 ? 280 : window.innerWidth >= 640 ? 220 : 160}
                    radiusY={window.innerWidth >= 1024 ? 190 : window.innerWidth >= 640 ? 150 : 110}
                    onSelect={handleSelect}
                    onHover={handleHover}
                    reducedMotion={reducedMotion}
                  />
                );
              })}
            </div>

            {/* Center info panel */}
            <Reveal delay={250}>
              <div className="absolute left-1/2 top-1/2 h-auto w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-ink-800 bg-black/80 p-6 backdrop-blur-sm">
                {/* Category badge */}
                <div className="flex items-center justify-between">
                  <span
                    className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider"
                    style={{
                      borderColor: `rgba(${CATEGORY_COLORS[activeAlgorithm.category].toString(16)}, 0.5)`,
                      color: `#${CATEGORY_COLORS[activeAlgorithm.category].toString(16).padStart(6, "0")}`,
                    }}
                  >
                    {activeAlgorithm.category}
                  </span>
                  
                  {/* Difficulty indicator */}
                  <span className="font-mono text-[10px] text-paper/50">
                    {activeAlgorithm.difficulty}
                  </span>
                </div>

                {/* Algorithm name */}
                <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight text-paper">
                  {activeAlgorithm.name}
                </h3>

                {/* Description */}
                <p className="mt-3 text-sm leading-relaxed text-paper/70">
                  {activeAlgorithm.shortDescription}
                </p>

                {/* Visual preview */}
                <div className="mt-4 overflow-hidden rounded-lg border border-ink-800 bg-ink-950/50">
                  <div className="h-20 w-full">
                    <AlgorithmVisual
                      visualType={activeAlgorithm.visualType}
                      isActive={true}
                      reducedMotion={reducedMotion}
                    />
                  </div>
                </div>

                {/* Action button */}
                <div className="mt-5">
                  {activeAlgorithm.route ? (
                    <ButtonLink
                      to={activeAlgorithm.route}
                      variant="primary"
                      className="w-full"
                      arrow
                    >
                      Explore Algorithm
                    </ButtonLink>
                  ) : (
                    <button
                      type="button"
                      className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full border border-pulse-500/50 bg-pulse-500 px-6 py-3 font-display text-[15px] font-semibold tracking-tight text-ink-950 transition-all duration-300 hover:bg-pulse-400 active:scale-[0.98]"
                      disabled
                    >
                      Coming Soon
                      <IconArrowRight
                        size={17}
                        className="transition-transform duration-300 group-hover:translate-x-1"
                      />
                    </button>
                  )}
                </div>
              </div>
            </Reveal>

            {/* Navigation controls */}
            <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-3">
              <button
                type="button"
                onClick={goToPrevious}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-paper/20 text-paper/70 transition-colors hover:border-pulse-400 hover:text-pulse-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-pulse-400"
                aria-label="Previous algorithm"
              >
                <IconChevron size={20} className="rotate-90" />
              </button>
              
              <button
                type="button"
                onClick={() => setIsPaused((p) => !p)}
                className="flex h-10 items-center justify-center rounded-full border border-paper/20 px-4 font-mono text-[10px] uppercase tracking-wider text-paper/70 transition-colors hover:border-pulse-400 hover:text-pulse-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-pulse-400"
                aria-label={isPaused ? "Resume auto-rotation" : "Pause auto-rotation"}
              >
                {isPaused ? "Play" : "Pause"}
              </button>
              
              <button
                type="button"
                onClick={goToNext}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-paper/20 text-paper/70 transition-colors hover:border-pulse-400 hover:text-pulse-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-pulse-400"
                aria-label="Next algorithm"
              >
                <IconChevron size={20} className="-rotate-90" />
              </button>
            </div>
          </div>
        </Reveal>

        {/* Keyboard hint */}
        <Reveal delay={350}>
          <p className="mt-8 text-center font-mono text-[10.5px] tracking-wide text-paper/40">
            Use arrow keys to navigate · Space to pause
          </p>
        </Reveal>
      </div>
    </section>
  );
}
