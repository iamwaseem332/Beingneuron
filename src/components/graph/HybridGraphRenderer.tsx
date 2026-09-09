// src/components/graph/HybridGraphRenderer.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GraphNode, GraphEdge, LayoutConfig, LayoutResult } from '../../lib/graph/layouts/types';
import { LayoutEngineFactory } from '../../lib/graph/layouts';
import { adaptLayoutToViewport, createViewportObserver, ViewportMetrics, shouldEnableReducedMotion } from '../../lib/graph/viewportAdapter';

export type GraphMode = 'hierarchical' | 'clustered' | 'exploratory';

export interface HybridGraphRendererProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paperId?: string;
  onNodeClick?: (node: GraphNode) => void;
  onEdgeClick?: (edge: GraphEdge) => void;
  initialMode?: GraphMode;
}

interface NodeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
}

interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
}

const NODE_COLORS: Record<string, string> = {
  concept: '#60A5FA',
  method: '#34D399',
  dataset: '#F472B6',
  model: '#A78BFA',
  author: '#FBBF24',
  institution: '#FB923C',
  claim: '#EF4444',
  result: '#10B981',
  limitation: '#6B7280',
};

const EDGE_COLORS: Record<string, string> = {
  uses: '#6B7280',
  evaluates_on: '#3B82F6',
  improves: '#10B981',
  contradicts: '#EF4444',
  extends: '#8B5CF6',
  derives_from: '#F59E0B',
  co_occurs: '#9CA3AF',
};

export const HybridGraphRenderer: React.FC<HybridGraphRendererProps> = ({
  nodes,
  edges,
  paperId,
  onNodeClick,
  onEdgeClick,
  initialMode = 'hierarchical',
}) => {
  const [mode, setMode] = useState<GraphMode>(initialMode);
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [viewport, setViewport] = useState<ViewportMetrics>({
    width: 800,
    height: 600,
    isFullscreen: false,
    devicePixelRatio: 1,
  });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const reducedMotion = shouldEnableReducedMotion();

  // Load persisted mode preference
  useEffect(() => {
    if (paperId) {
      const saved = localStorage.getItem(`graph-mode-${paperId}`);
      if (saved && ['hierarchical', 'clustered', 'exploratory'].includes(saved)) {
        setMode(saved as GraphMode);
      } else if (initialMode) {
        setMode(initialMode);
      }
    }
  }, [paperId, initialMode]);

  // Persist mode preference
  useEffect(() => {
    if (paperId) {
      localStorage.setItem(`graph-mode-${paperId}`, mode);
    }
  }, [paperId, mode]);

  // Viewport observer
  useEffect(() => {
    const observer = createViewportObserver(setViewport, { debounceMs: 150, trackFullscreen: true });
    return () => observer.disconnect();
  }, []);

  // Compute layout when nodes/edges/mode change
  useEffect(() => {
    let cancelled = false;

    const computeLayout = async () => {
      setIsLoading(true);
      
      try {
        const algorithm = mode === 'hierarchical' ? 'dagre-hierarchical' 
                       : mode === 'clustered' ? 'elk-layered' 
                       : 'force-directed';

        const config: LayoutConfig = {
          algorithm,
          direction: 'TB',
          nodeSpacing: 50,
          rankSpacing: 80,
          padding: 40,
          animateTransition: !reducedMotion,
        };

        const result = await LayoutEngineFactory.compute(nodes, edges, config);
        
        if (!cancelled) {
          const adapted = adaptLayoutToViewport(result, viewport, config);
          setLayout(adapted);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Layout computation failed:', error);
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    computeLayout();

    return () => {
      cancelled = true;
    };
  }, [nodes, edges, mode, viewport, reducedMotion]);

  const getNodeStyle = useCallback((node: GraphNode): NodeStyle => {
    const baseColor = NODE_COLORS[node.type] || '#6B7280';
    const isSelected = selectedNode === node.id;
    
    return {
      fill: baseColor,
      stroke: isSelected ? '#1F2937' : '#374151',
      strokeWidth: isSelected ? 3 : 1.5,
    };
  }, [selectedNode]);

  const getEdgeStyle = useCallback((edge: GraphEdge): EdgeStyle => {
    const baseColor = EDGE_COLORS[edge.type] || '#6B7280';
    
    return {
      stroke: baseColor,
      strokeWidth: edge.isExplicitlyStated ? 2 : 1,
      strokeDasharray: edge.isExplicitlyStated ? undefined : '4,4',
    };
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node.id === selectedNode ? null : node.id);
    onNodeClick?.(node);
  }, [selectedNode, onNodeClick]);

  const handleModeToggle = useCallback(() => {
    setMode(prev => {
      if (prev === 'hierarchical') return 'clustered';
      if (prev === 'clustered') return 'exploratory';
      return 'hierarchical';
    });
  }, []);

  const handleFullscreen = useCallback(async () => {
    const elem = svgRef.current?.parentElement;
    if (!elem) return;

    try {
      if (!document.fullscreenElement) {
        await elem.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen not supported:', err);
    }
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'm') {
        handleModeToggle();
      }
      if (e.key === 'f') {
        handleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleModeToggle, handleFullscreen]);

  // Memoized node rendering
  const renderedNodes = useMemo(() => {
    if (!layout) return null;

    return layout.nodes.map(node => {
      const graphNode = nodes.find(n => n.id === node.id);
      if (!graphNode) return null;

      const style = getNodeStyle(graphNode);

      return (
        <g
          key={node.id}
          className="graph-node"
          role="button"
          tabIndex={0}
          aria-label={`${graphNode.type}: ${graphNode.label}`}
          onClick={() => handleNodeClick(graphNode)}
          onKeyDown={(e) => e.key === 'Enter' && handleNodeClick(graphNode)}
          style={{ cursor: 'pointer', transition: reducedMotion ? 'none' : 'transform 0.3s ease' }}
          transform={`translate(${node.x},${node.y})`}
        >
          <rect
            width={node.width}
            height={node.height}
            rx={8}
            ry={8}
            fill={style.fill}
            stroke={style.stroke}
            strokeWidth={style.strokeWidth}
          />
          <text
            x={node.width / 2}
            y={node.height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#FFFFFF"
            fontSize={Math.max(12, node.width / 10)}
            fontWeight={500}
            style={{ pointerEvents: 'none' }}
          >
            {graphNode.label.length > 20 
              ? `${graphNode.label.substring(0, 18)}...` 
              : graphNode.label}
          </text>
        </g>
      );
    });
  }, [layout, nodes, getNodeStyle, handleNodeClick, reducedMotion]);

  // Memoized edge rendering
  const renderedEdges = useMemo(() => {
    if (!layout) return null;

    return layout.edges.map((edge, idx) => {
      const sourceNode = layout.nodes.find(n => n.id === edge.source);
      const targetNode = layout.nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return null;

      const graphEdge = edges.find(e => e.source === edge.source && e.target === edge.target);
      if (!graphEdge) return null;

      const style = getEdgeStyle(graphEdge);
      const midX = (sourceNode.x + targetNode.x) / 2;
      const midY = (sourceNode.y + targetNode.y) / 2;

      return (
        <g key={`${edge.source}-${edge.target}-${idx}`} className="graph-edge">
          <line
            x1={sourceNode.x + sourceNode.width / 2}
            y1={sourceNode.y + sourceNode.height / 2}
            x2={targetNode.x + targetNode.width / 2}
            y2={targetNode.y + targetNode.height / 2}
            stroke={style.stroke}
            strokeWidth={style.strokeWidth}
            strokeDasharray={style.strokeDasharray}
            opacity={0.7}
          />
        </g>
      );
    });
  }, [layout, edges, getEdgeStyle]);

  return (
    <div className="relative w-full h-full bg-gray-50 dark:bg-gray-900" role="application" aria-label="Knowledge graph visualization">
      {/* Mode toggle button */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          onClick={handleModeToggle}
          className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          aria-label={`Current mode: ${mode}. Click to switch`}
        >
          {mode === 'hierarchical' && '📊 Hierarchical'}
          {mode === 'clustered' && '🔵 Clustered'}
          {mode === 'exploratory' && '🔍 Exploratory'}
        </button>
        <button
          onClick={handleFullscreen}
          className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          aria-label="Toggle fullscreen"
        >
          ⛶ Fullscreen
        </button>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Graph SVG */}
      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox={layout ? `${layout.bounds.minX - 20} ${layout.bounds.minY - 20} ${layout.bounds.maxX - layout.bounds.minX + 40} ${layout.bounds.maxY - layout.bounds.minY + 40}` : '0 0 800 600'}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#6B7280" />
          </marker>
        </defs>
        {renderedEdges}
        {renderedNodes}
      </svg>

      {/* Accessibility info panel */}
      {selectedNode && (
        <div 
          className="absolute bottom-4 left-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-w-xs"
          role="complementary"
          aria-live="polite"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            {nodes.find(n => n.id === selectedNode)?.label}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Type: {nodes.find(n => n.id === selectedNode)?.type}
          </p>
          <button
            onClick={() => setSelectedNode(null)}
            className="mt-2 text-xs text-blue-600 hover:text-blue-800"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default HybridGraphRenderer;
