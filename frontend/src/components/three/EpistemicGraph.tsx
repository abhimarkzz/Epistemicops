/**
 * EpistemicGraph — Next-Generation Observability UI for EpistemicOps.
 *
 * Real functional 3D WebGL scene with procedural Three.js geometry,
 * timeline synchronization, memory constellation, camera orbit/focus/reset,
 * interactive service inspection, and accessible 2D SVG topology fallback.
 */

import { useRef, useMemo, useState, useEffect, Suspense, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Billboard, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Incident, StreamEvent, DiagnosisResult, PodStatus, TraceData } from '../../types';

// ── Types ──────────────────────────────────────────────────────

export interface TopologyNode {
  id: string;
  label: string;
  type: 'service' | 'database' | 'cache' | 'queue' | 'dependency' | 'pod';
  position: [number, number, number];
  state: 'healthy' | 'warning' | 'critical' | 'investigating' | 'root-cause';
  details?: string;
  isMemoryRelated?: boolean;
  isSelected?: boolean;
}

export interface TopologyEdge {
  from: string;
  to: string;
  label?: string;
  highlighted?: boolean;
}

export interface EpistemicGraphProps {
  incident: Incident | null;
  timelineItems: Array<{ ev: StreamEvent; at: number }>;
  diagnosis: DiagnosisResult | null;
  pods: PodStatus | null;
  traces: TraceData | null;
  memoryRecalled: boolean;
  memoryCount: number;
  phase: 'idle' | 'running' | 'completed' | 'failed';
  quality: 'high' | 'balanced' | 'low';
  onNodeClick?: (nodeId: string) => void;
  className?: string;
}

// ── Color Constants ─────────────────────────────────────────────

const COLORS = {
  healthy:       new THREE.Color('#22C55E'),
  warning:       new THREE.Color('#F59E0B'),
  critical:      new THREE.Color('#EF4444'),
  investigating: new THREE.Color('#22D3EE'),
  rootCause:     new THREE.Color('#FF6B35'),
  memory:        new THREE.Color('#A78BFA'),
  indigo:        new THREE.Color('#6366F1'),
  edge:          new THREE.Color('#2A3545'),
  edgeHighlight: new THREE.Color('#22D3EE'),
  surface:       new THREE.Color('#0D1118'),
  text:          new THREE.Color('#9AA6B2'),
};

// ── Topology Derivation ─────────────────────────────────────────

export function deriveTopology(
  incident: Incident | null,
  pods: PodStatus | null,
  traces: TraceData | null,
  diagnosis: DiagnosisResult | null,
  timelineItems: Array<{ ev: StreamEvent; at: number }>,
  memoryRecalled: boolean,
  phase: string,
  selectedNodeId?: string | null,
): { nodes: TopologyNode[]; edges: TopologyEdge[] } {
  if (!incident) return { nodes: [], edges: [] };

  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const nodeIds = new Set<string>();

  // Determine active tool and inspected tools from timeline
  const inspectedTools = new Set<string>();
  let activeTool = '';

  for (const item of timelineItems) {
    if (item.ev.event === 'tool_started') {
      const tool = String(item.ev.data.tool ?? item.ev.data.name ?? '');
      inspectedTools.add(tool);
      activeTool = tool;
    }
  }

  const isInspectingLogs = phase === 'running' && (activeTool === 'get_logs' || activeTool === 'fetch_logs');
  const isInspectingMetrics = phase === 'running' && (activeTool === 'get_metrics' || activeTool === 'query_metrics');
  const isInspectingTraces = (phase === 'running' && (activeTool === 'get_trace' || activeTool === 'fetch_traces')) ||
    (traces && traces.spans && traces.spans.length > 0);
  const isInspectingPods = phase === 'running' && (activeTool === 'get_pod_status' || activeTool === 'list_pods');

  const hasDiagnosis = !!diagnosis;
  const rootCauseDiagnosis = String(diagnosis?.root_cause ?? '').toLowerCase();

  function getNodeState(nodeId: string, nodeType: string): TopologyNode['state'] {
    // 1. Root Cause identification
    if (hasDiagnosis && diagnosis?.status === 'completed') {
      if (rootCauseDiagnosis.includes(nodeId.toLowerCase())) {
        return 'root-cause';
      }
      if (nodeId === incident!.service) {
        return 'root-cause';
      }
    }

    // 2. Failed investigation
    if (phase === 'failed' && nodeId === incident!.service) {
      return 'critical';
    }

    // 3. Active inspection state pulses
    if (phase === 'running') {
      if (nodeId === incident!.service && (isInspectingLogs || activeTool === '')) {
        return 'investigating';
      }
      if ((nodeType === 'database' || nodeType === 'cache') && isInspectingMetrics) {
        return 'investigating';
      }
      if (nodeType === 'pod' && isInspectingPods) {
        return 'investigating';
      }
      if (nodeId === incident!.service) {
        return 'investigating';
      }
    }

    // 4. Pod health checks
    if (pods?.pods) {
      const pod = pods.pods.find(p => p.name?.includes(nodeId) || nodeId.includes(String(p.name ?? '')));
      if (pod) {
        const podPhase = String(pod.phase ?? pod.status ?? '').toLowerCase();
        if (['failed', 'crashloopbackoff', 'imagepullbackoff', 'error'].includes(podPhase)) return 'critical';
        if (podPhase === 'pending') return 'warning';
      }
    }

    // 5. Service-level severity
    if (nodeId === incident!.service) {
      const sev = incident!.severity?.toLowerCase();
      if (sev === 'critical' || sev === 'p1') return 'critical';
      if (sev === 'high' || sev === 'p2') return 'warning';
    }

    return 'healthy';
  }

  function addNode(
    id: string,
    label: string,
    type: TopologyNode['type'],
    pos: [number, number, number],
    details?: string,
  ) {
    if (nodeIds.has(id)) return;
    nodeIds.add(id);
    nodes.push({
      id,
      label,
      type,
      position: pos,
      state: getNodeState(id, type),
      details,
      isMemoryRelated: memoryRecalled && id === incident!.service,
      isSelected: selectedNodeId ? id === selectedNodeId : id === incident!.service,
    });
  }

  // Check for legacy topology field (inc-001, inc-002)
  const legacyTopo = (incident as unknown as {
    topology?: { service: string; dependencies?: Array<{ name: string; type: string; pool_size?: number }> }
  }).topology;

  if (legacyTopo && legacyTopo.dependencies) {
    // Primary service at center
    addNode(
      legacyTopo.service,
      legacyTopo.service,
      'service',
      [0, 0, 0],
      `${incident.title || incident.id} (Severity: ${incident.severity})`,
    );

    const deps = legacyTopo.dependencies;
    const angleStep = (2 * Math.PI) / Math.max(deps.length, 1);
    const radius = 3.6;

    deps.forEach((dep, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const depType: TopologyNode['type'] = dep.type === 'database' ? 'database'
        : dep.type === 'cache' ? 'cache'
        : dep.type === 'queue' ? 'queue'
        : 'dependency';

      const detailStr = dep.pool_size
        ? `Connection Pool: ${dep.pool_size} slots`
        : `Type: ${dep.type}`;

      addNode(dep.name, dep.name, depType, [x, 0, z], detailStr);

      const edgeHighlighted = isInspectingTraces ||
        (isInspectingMetrics && (dep.type === 'database' || dep.type === 'cache'));

      edges.push({
        from: legacyTopo.service,
        to: dep.name,
        highlighted: !!edgeHighlighted,
        label: dep.type,
      });
    });
  } else {
    // Newer fixtures — derive from service + pod_status + traces
    addNode(
      incident.service,
      incident.service,
      'service',
      [0, 0, 0],
      `${incident.title || incident.id} (Category: ${incident.category || 'incident'})`,
    );

    // Pods
    if (pods?.pods && pods.pods.length > 0) {
      const podAngleStep = (2 * Math.PI) / pods.pods.length;
      const podRadius = 2.6;
      pods.pods.forEach((pod, i) => {
        const angle = podAngleStep * i;
        const x = Math.cos(angle) * podRadius;
        const z = Math.sin(angle) * podRadius;
        const shortName = pod.name.replace(/.*?-([^-]+-[^-]+)$/, '$1');
        const detailStr = `Status: ${pod.phase || pod.status || 'unknown'} · Restarts: ${pod.restarts ?? 0}`;
        addNode(pod.name, shortName, 'pod', [x, -0.4, z], detailStr);
        edges.push({
          from: incident.service,
          to: pod.name,
          highlighted: isInspectingPods,
        });
      });
    }

    // Dependencies from traces
    if (traces && (traces as TraceData).spans) {
      const traceSpans = (traces as TraceData).spans ?? [];
      const seenServices = new Set<string>();
      traceSpans.forEach((span) => {
        const svcName = String((span as Record<string, unknown>).service ?? '');
        if (svcName && svcName !== incident.service && !seenServices.has(svcName)) {
          seenServices.add(svcName);
          const angle = (Math.PI * 2 * seenServices.size) / (traceSpans.length + 1);
          const detailStr = `Span duration: ${(span as Record<string, unknown>).duration_ms ?? '—'}ms`;
          addNode(svcName, svcName, 'dependency', [Math.cos(angle) * 4.2, 0.4, Math.sin(angle) * 4.2], detailStr);
          edges.push({
            from: incident.service,
            to: svcName,
            highlighted: true,
          });
        }
      });
    }

    // Namespace/Cluster node if minimal
    if (nodes.length < 3) {
      const ns = pods?.namespace || (incident as unknown as Record<string, unknown>).environment as string || 'cluster-prod';
      addNode(ns, ns, 'dependency', [0, 2.2, 0], `Environment: ${incident.environment || 'production'}`);
      edges.push({ from: ns, to: incident.service, highlighted: false });
    }
  }

  return { nodes, edges };
}

// ── 3D Service Node ─────────────────────────────────────────────

function ServiceNode({
  node,
  quality,
  reducedMotion,
  onClick,
  onDoubleClick,
}: {
  node: TopologyNode;
  quality: string;
  reducedMotion: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const selectionRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const color = useMemo(() => {
    if (node.state === 'root-cause') return COLORS.rootCause;
    if (node.state === 'critical') return COLORS.critical;
    if (node.state === 'warning') return COLORS.warning;
    if (node.state === 'investigating') return COLORS.investigating;
    if (node.isMemoryRelated) return COLORS.memory;
    return COLORS.healthy;
  }, [node.state, node.isMemoryRelated]);

  const geometry = useMemo(() => {
    switch (node.type) {
      case 'database': return new THREE.CylinderGeometry(0.38, 0.38, 0.55, quality === 'low' ? 8 : 20);
      case 'cache': return new THREE.OctahedronGeometry(0.42);
      case 'queue': return new THREE.BoxGeometry(0.65, 0.32, 0.32);
      case 'pod': return new THREE.SphereGeometry(0.22, quality === 'low' ? 8 : 14, quality === 'low' ? 8 : 14);
      default: return new THREE.SphereGeometry(0.44, quality === 'low' ? 10 : 20, quality === 'low' ? 10 : 20);
    }
  }, [node.type, quality]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    if (!reducedMotion) {
      // Subtle float
      meshRef.current.position.y = node.position[1] + Math.sin(Date.now() * 0.0012 + node.position[0]) * 0.04;

      // Pulse for active investigation or root-cause
      if ((node.state === 'investigating' || node.state === 'root-cause') && glowRef.current) {
        const scale = 1 + Math.sin(Date.now() * 0.004) * 0.18;
        glowRef.current.scale.setScalar(scale);
      }

      // Selection indicator spin
      if (node.isSelected && selectionRef.current) {
        selectionRef.current.rotation.z += 0.015;
      }
    }

    // Hover scale interpolation
    const targetScale = hovered ? 1.18 : (node.isSelected ? 1.08 : 1);
    meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 10);
  });

  return (
    <group position={node.position}>
      {/* State Glow Ring */}
      {(node.state === 'investigating' || node.state === 'root-cause' || node.isMemoryRelated) && (
        <mesh ref={glowRef}>
          <ringGeometry args={[0.55, 0.72, 32]} />
          <meshBasicMaterial
            color={node.isMemoryRelated ? COLORS.memory : color}
            transparent
            opacity={0.28}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Selected Indicator Ring */}
      {node.isSelected && (
        <mesh ref={selectionRef} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.75, 0.82, 32]} />
          <meshBasicMaterial
            color={COLORS.indigo}
            transparent
            opacity={0.7}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Main Node Mesh */}
      <mesh
        ref={meshRef}
        geometry={geometry}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick?.();
        }}
        onPointerEnter={() => {
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerLeave={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={node.state === 'investigating' ? 0.45 : (node.state === 'root-cause' ? 0.5 : 0.18)}
          metalness={0.35}
          roughness={0.65}
        />
      </mesh>

      {/* Node Label Billboard */}
      <Billboard>
        <Text
          position={[0, node.type === 'pod' ? -0.38 : -0.72, 0]}
          fontSize={node.type === 'pod' ? 0.16 : 0.22}
          color={hovered || node.isSelected ? '#F5F7FA' : '#9AA6B2'}
          anchorX="center"
          anchorY="top"
          maxWidth={3.2}
        >
          {node.label}
        </Text>
      </Billboard>

      {/* Hover Tooltip */}
      {hovered && (
        <Html center position={[0, 0.85, 0]} style={{ pointerEvents: 'none' }}>
          <div className="graph-tooltip">
            <span className="graph-tooltip-name">{node.label}</span>
            <span className={`graph-tooltip-state graph-tooltip-${node.state}`}>
              {node.state === 'root-cause' ? 'Root Cause' : node.state}
            </span>
            <span className="graph-tooltip-type">{node.type}</span>
            {node.details && <span className="graph-tooltip-detail">{node.details}</span>}
          </div>
        </Html>
      )}
    </group>
  );
}

// ── 3D Edge Component ───────────────────────────────────────────

function TopologyEdgeComponent({
  edge,
  nodes,
}: {
  edge: TopologyEdge;
  nodes: TopologyNode[];
}) {
  const from = nodes.find(n => n.id === edge.from);
  const to = nodes.find(n => n.id === edge.to);

  if (!from || !to) return null;

  const points = useMemo<[number, number, number][]>(() => {
    return [from.position, to.position];
  }, [from.position, to.position]);

  return (
    <Line
      points={points}
      color={edge.highlighted ? COLORS.edgeHighlight : COLORS.edge}
      transparent
      opacity={edge.highlighted ? 0.75 : 0.28}
      lineWidth={edge.highlighted ? 1.8 : 1}
    />
  );
}

// ── Memory Constellation ────────────────────────────────────────

function MemoryConstellation({
  memoryCount,
  reducedMotion,
}: {
  memoryCount: number;
  reducedMotion: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!reducedMotion && groupRef.current) {
      groupRef.current.rotation.y += 0.0025;
    }
  });

  const memoryPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    const count = Math.min(memoryCount, 5);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const r = 2.4;
      positions.push([Math.cos(angle) * r, 3.2 + Math.sin(i * 1.5) * 0.35, Math.sin(angle) * r]);
    }
    return positions;
  }, [memoryCount]);

  return (
    <group ref={groupRef}>
      {memoryPositions.map((pos, i) => (
        <group key={i} position={pos}>
          <mesh>
            <sphereGeometry args={[0.16, 12, 12]} />
            <meshStandardMaterial
              color={COLORS.memory}
              emissive={COLORS.memory}
              emissiveIntensity={0.4}
              transparent
              opacity={0.85}
            />
          </mesh>
          <Line
            points={[pos, [0, 0, 0]]}
            color={COLORS.memory}
            transparent
            opacity={0.2}
            lineWidth={1}
          />
        </group>
      ))}

      <Billboard position={[0, 4.4, 0]}>
        <Text fontSize={0.2} color="#A78BFA" anchorX="center">
          {memoryCount} memor{memoryCount === 1 ? 'y' : 'ies'} recalled
        </Text>
      </Billboard>
    </group>
  );
}

// ── Interactive 3D Camera Controller ────────────────────────────

function CameraController({
  focusPosition,
  fitTrigger,
  resetTrigger,
  nodes,
  reducedMotion,
}: {
  focusPosition: [number, number, number] | null;
  fitTrigger: number;
  resetTrigger: number;
  nodes: TopologyNode[];
  reducedMotion: boolean;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const targetCamPos = useRef<THREE.Vector3 | null>(null);
  const targetLookAt = useRef<THREE.Vector3 | null>(null);

  // Focus on node
  useEffect(() => {
    if (!focusPosition) return;
    const [x, y, z] = focusPosition;
    const newCam = new THREE.Vector3(x, y + 1.2, z + 3.8);
    const newTarget = new THREE.Vector3(x, y, z);

    if (reducedMotion) {
      camera.position.copy(newCam);
      camera.lookAt(newTarget);
      if (controlsRef.current) {
        controlsRef.current.target.copy(newTarget);
        controlsRef.current.update();
      }
    } else {
      targetCamPos.current = newCam;
      targetLookAt.current = newTarget;
    }
  }, [focusPosition, camera, reducedMotion]);

  // Fit all nodes
  useEffect(() => {
    if (fitTrigger === 0 || nodes.length === 0) return;
    const box = new THREE.Box3();
    nodes.forEach((n) => box.expandByPoint(new THREE.Vector3(...n.position)));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 4.5);
    const fitCam = new THREE.Vector3(center.x, center.y + maxDim * 0.4, center.z + maxDim * 1.3);

    if (reducedMotion) {
      camera.position.copy(fitCam);
      camera.lookAt(center);
      if (controlsRef.current) {
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }
    } else {
      targetCamPos.current = fitCam;
      targetLookAt.current = center;
    }
  }, [fitTrigger, nodes, camera, reducedMotion]);

  // Reset Camera
  useEffect(() => {
    if (resetTrigger === 0) return;
    const defaultCam = new THREE.Vector3(0, 3, 8);
    const defaultTarget = new THREE.Vector3(0, 0, 0);

    if (reducedMotion) {
      camera.position.copy(defaultCam);
      camera.lookAt(defaultTarget);
      if (controlsRef.current) {
        controlsRef.current.target.copy(defaultTarget);
        controlsRef.current.update();
      }
    } else {
      targetCamPos.current = defaultCam;
      targetLookAt.current = defaultTarget;
    }
  }, [resetTrigger, camera, reducedMotion]);

  useFrame((_, delta) => {
    if (!reducedMotion) {
      if (targetCamPos.current) {
        camera.position.lerp(targetCamPos.current, Math.min(delta * 5, 1));
        if (camera.position.distanceTo(targetCamPos.current) < 0.05) {
          camera.position.copy(targetCamPos.current);
          targetCamPos.current = null;
        }
      }
      if (targetLookAt.current && controlsRef.current) {
        controlsRef.current.target.lerp(targetLookAt.current, Math.min(delta * 5, 1));
        controlsRef.current.update();
        if (controlsRef.current.target.distanceTo(targetLookAt.current) < 0.05) {
          controlsRef.current.target.copy(targetLookAt.current);
          targetLookAt.current = null;
        }
      }
    }
  });

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        maxDistance={22}
        autoRotate={!reducedMotion && targetCamPos.current === null}
        autoRotateSpeed={0.3}
        enableDamping
        dampingFactor={0.06}
      />
    </>
  );
}

// ── 3D Scene Content ────────────────────────────────────────────

function SceneContent({
  nodes,
  edges,
  memoryRecalled,
  memoryCount,
  quality,
  reducedMotion,
  focusPosition,
  fitTrigger,
  resetTrigger,
  onNodeClick,
  onNodeDoubleClick,
}: {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  memoryRecalled: boolean;
  memoryCount: number;
  quality: string;
  reducedMotion: boolean;
  focusPosition: [number, number, number] | null;
  fitTrigger: number;
  resetTrigger: number;
  onNodeClick?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
}) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 8, 5]} intensity={0.65} color="#B8C4D4" />
      <pointLight position={[-3, 3, -3]} intensity={0.35} color="#6366F1" distance={14} />
      <pointLight position={[3, -1, 3]} intensity={0.2} color="#22D3EE" distance={12} />

      {/* Edges */}
      {edges.map((edge, i) => (
        <TopologyEdgeComponent key={`e-${i}`} edge={edge} nodes={nodes} />
      ))}

      {/* Nodes */}
      {nodes.map(node => (
        <ServiceNode
          key={node.id}
          node={node}
          quality={quality}
          reducedMotion={reducedMotion}
          onClick={() => onNodeClick?.(node.id)}
          onDoubleClick={() => onNodeDoubleClick?.(node.id)}
        />
      ))}

      {/* Memory constellation */}
      {memoryRecalled && memoryCount > 0 && (
        <MemoryConstellation
          memoryCount={memoryCount}
          reducedMotion={reducedMotion}
        />
      )}

      {/* Camera & Controls */}
      <CameraController
        focusPosition={focusPosition}
        fitTrigger={fitTrigger}
        resetTrigger={resetTrigger}
        nodes={nodes}
        reducedMotion={reducedMotion}
      />
    </>
  );
}

// ── Accessible 2D Topology Fallback ──────────────────────────────

function EpistemicGraph2D({
  nodes,
  edges,
  memoryRecalled,
  memoryCount,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  memoryRecalled: boolean;
  memoryCount: number;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}) {
  const centerNode = nodes.find(n => n.type === 'service') || nodes[0];
  const satelliteNodes = nodes.filter(n => n !== centerNode);

  // Layout calculation
  const width = 640;
  const height = 300;
  const cx = width / 2;
  const cy = height / 2 + 10;
  const radius = Math.min(width, height) * 0.38;

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    if (centerNode) map.set(centerNode.id, { x: cx, y: cy });

    satelliteNodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(satelliteNodes.length, 1) - Math.PI / 2;
      map.set(node.id, {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * (radius * 0.75),
      });
    });
    return map;
  }, [centerNode, satelliteNodes, cx, cy, radius]);

  const getStateColor = (state: TopologyNode['state']) => {
    switch (state) {
      case 'root-cause': return '#FF6B35';
      case 'critical': return '#EF4444';
      case 'warning': return '#F59E0B';
      case 'investigating': return '#22D3EE';
      default: return '#22C55E';
    }
  };

  return (
    <div className="graph-2d-container">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="graph-2d-svg"
        role="img"
        aria-label="2D Topology Graph"
      >
        <defs>
          <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="node-surface" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#161D2A" />
            <stop offset="100%" stopColor="#0D1118" />
          </radialGradient>
        </defs>

        {/* Memory constellation header arc in 2D */}
        {memoryRecalled && memoryCount > 0 && (
          <g className="graph-2d-memory">
            <path
              d={`M ${cx - 120} 35 Q ${cx} 15 ${cx + 120} 35`}
              fill="none"
              stroke="#A78BFA"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity="0.6"
            />
            <circle cx={cx - 100} cy={32} r={4} fill="#A78BFA" />
            <circle cx={cx} cy={20} r={5} fill="#A78BFA" />
            <circle cx={cx + 100} cy={32} r={4} fill="#A78BFA" />
            <line x1={cx} y1={25} x2={cx} y2={cy - 28} stroke="#A78BFA" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
            <text x={cx} y={12} fill="#A78BFA" fontSize="11" textAnchor="middle" fontFamily="var(--font-mono)">
              {memoryCount} memories recalled
            </text>
          </g>
        )}

        {/* Edges */}
        {edges.map((edge, i) => {
          const fromPos = positions.get(edge.from);
          const toPos = positions.get(edge.to);
          if (!fromPos || !toPos) return null;
          return (
            <line
              key={`e2d-${i}`}
              x1={fromPos.x}
              y1={fromPos.y}
              x2={toPos.x}
              y2={toPos.y}
              stroke={edge.highlighted ? '#22D3EE' : '#2A3545'}
              strokeWidth={edge.highlighted ? 2 : 1}
              strokeDasharray={edge.highlighted ? '4 3' : undefined}
              className={edge.highlighted ? 'edge-highlighted-2d' : undefined}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map(node => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          const isSelected = node.id === selectedNodeId;
          const nodeColor = getStateColor(node.state);
          const r = node.type === 'pod' ? 14 : 20;

          return (
            <g
              key={`n2d-${node.id}`}
              transform={`translate(${pos.x}, ${pos.y})`}
              className="graph-2d-node-group"
              onClick={() => onSelectNode(node.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectNode(node.id);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`${node.label}, type ${node.type}, state ${node.state}`}
            >
              {/* Outer Selection / Status Halo */}
              {(isSelected || node.state === 'investigating' || node.state === 'root-cause') && (
                <circle
                  r={r + 7}
                  fill="none"
                  stroke={isSelected ? '#6366F1' : nodeColor}
                  strokeWidth="2"
                  opacity={isSelected ? 0.8 : 0.4}
                  strokeDasharray={node.state === 'investigating' ? '3 3' : undefined}
                />
              )}

              {/* Node Body */}
              <circle
                r={r}
                fill="url(#node-surface)"
                stroke={nodeColor}
                strokeWidth={isSelected ? 2.5 : 1.5}
                filter={node.state === 'investigating' ? 'url(#glow-cyan)' : undefined}
              />

              {/* Node Type Glyph */}
              <text
                dy={3}
                fill={nodeColor}
                fontSize={node.type === 'pod' ? 9 : 10}
                fontWeight="700"
                textAnchor="middle"
                fontFamily="var(--font-mono)"
              >
                {node.type === 'database' ? 'DB'
                  : node.type === 'cache' ? 'MEM'
                  : node.type === 'queue' ? 'Q'
                  : node.type === 'pod' ? 'POD'
                  : 'SVC'}
              </text>

              {/* Label */}
              <text
                y={r + 14}
                fill={isSelected ? '#F5F7FA' : '#9AA6B2'}
                fontSize="11"
                fontWeight={isSelected ? '600' : '400'}
                textAnchor="middle"
                fontFamily="var(--font-ui)"
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Main EpistemicGraph Component ───────────────────────────────

export default function EpistemicGraph(props: EpistemicGraphProps) {
  const {
    incident,
    timelineItems,
    diagnosis,
    pods,
    traces,
    memoryRecalled,
    memoryCount,
    phase,
    quality,
    onNodeClick,
    className = '',
  } = props;

  // View mode: 3D or accessible 2D fallback
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusPosition, setFocusPosition] = useState<[number, number, number] | null>(null);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [resetTrigger, setResetTrigger] = useState(0);

  // Accessibility: prefers-reduced-motion
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // WebGL availability check
  const [webglAvailable] = useState(() => {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
      return false;
    }
  });

  // Switch to 2D if WebGL is unavailable
  useEffect(() => {
    if (!webglAvailable) {
      setViewMode('2d');
    }
  }, [webglAvailable]);

  // Derive topology
  const { nodes, edges } = useMemo(
    () => deriveTopology(incident, pods, traces, diagnosis, timelineItems, memoryRecalled, phase, selectedNodeId),
    [incident, pods, traces, diagnosis, timelineItems, memoryRecalled, phase, selectedNodeId],
  );

  // Selected node details object
  const selectedNode = useMemo(() => {
    return nodes.find(n => n.id === selectedNodeId) ?? null;
  }, [nodes, selectedNodeId]);

  // Handle node selection
  const handleSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    onNodeClick?.(nodeId);
  }, [onNodeClick]);

  // Handle double click in 3D: auto-focus
  const handleDoubleClickNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setFocusPosition([...node.position]);
    }
    onNodeClick?.(nodeId);
  }, [nodes, onNodeClick]);

  // DPR based on quality
  const dpr = useMemo(() => {
    if (quality === 'low') return 1;
    if (quality === 'balanced') return Math.min(window.devicePixelRatio, 1.5);
    return Math.min(window.devicePixelRatio, 2);
  }, [quality]);

  if (!incident) {
    return (
      <div className={`graph-empty ${className}`}>
        <div className="graph-empty-inner">
          <div className="graph-empty-mark">◇</div>
          <span className="graph-empty-label">Select an incident to view its topology</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`epistemic-graph ${className}`}
      role="region"
      aria-label={`Interactive system topology for ${incident.id}`}
    >
      {/* ── Top Bar: Title & Overlay Controls ── */}
      <div className="graph-info-bar">
        <span className="graph-title">Epistemic Graph</span>
        <span className="graph-stat-pill">{nodes.length} nodes · {edges.length} edges</span>
      </div>

      <div className="graph-toolbar">
        {/* 3D / 2D Segmented Control */}
        <div className="graph-mode-pill" role="group" aria-label="Topology view mode">
          <button
            type="button"
            className={`graph-pill-btn ${viewMode === '3d' ? 'active' : ''}`}
            onClick={() => setViewMode('3d')}
            disabled={!webglAvailable}
            title={webglAvailable ? 'Interactive 3D WebGL Scene' : 'WebGL unavailable'}
          >
            3D
          </button>
          <button
            type="button"
            className={`graph-pill-btn ${viewMode === '2d' ? 'active' : ''}`}
            onClick={() => setViewMode('2d')}
            title="Accessible 2D Topology Diagram"
          >
            2D
          </button>
        </div>

        {viewMode === '3d' && (
          <>
            <button
              type="button"
              className="graph-btn"
              onClick={() => setFitTrigger(t => t + 1)}
              title="Fit all topology nodes in view"
            >
              Fit View
            </button>
            <button
              type="button"
              className="graph-btn"
              onClick={() => setResetTrigger(t => t + 1)}
              title="Reset camera to default view"
            >
              Reset
            </button>
          </>
        )}

        <span className="graph-quality-pill" title={`Render quality: ${quality}`}>
          {quality}
        </span>
      </div>

      {/* ── Main View (3D Canvas or 2D SVG) ── */}
      {viewMode === '3d' && webglAvailable ? (
        <Suspense fallback={<div className="graph-loading"><span>Initializing 3D graph…</span></div>}>
          <Canvas
            dpr={dpr}
            camera={{ position: [0, 3, 8], fov: 50, near: 0.1, far: 100 }}
            gl={{
              alpha: true,
              antialias: quality !== 'low',
              powerPreference: quality === 'low' ? 'low-power' : 'default',
            }}
            style={{ background: 'transparent' }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x000000, 0);
            }}
          >
            <SceneContent
              nodes={nodes}
              edges={edges}
              memoryRecalled={memoryRecalled}
              memoryCount={memoryCount}
              quality={quality}
              reducedMotion={reducedMotion}
              focusPosition={focusPosition}
              fitTrigger={fitTrigger}
              resetTrigger={resetTrigger}
              onNodeClick={handleSelectNode}
              onNodeDoubleClick={handleDoubleClickNode}
            />
          </Canvas>
        </Suspense>
      ) : (
        <EpistemicGraph2D
          nodes={nodes}
          edges={edges}
          memoryRecalled={memoryRecalled}
          memoryCount={memoryCount}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
        />
      )}

      {/* ── Selected Service Details Floating Panel ── */}
      {selectedNode && (
        <div className="graph-details-card" role="dialog" aria-label={`Details for ${selectedNode.label}`}>
          <div className="graph-details-header">
            <div className="graph-details-title-row">
              <span className="graph-details-id">{selectedNode.label}</span>
              <span className={`badge graph-badge-${selectedNode.state}`}>
                {selectedNode.state === 'root-cause' ? 'Root Cause' : selectedNode.state}
              </span>
            </div>
            <button
              type="button"
              className="graph-close-btn"
              onClick={() => setSelectedNodeId(null)}
              aria-label="Close details"
            >
              ✕
            </button>
          </div>

          <div className="graph-details-body">
            <div className="graph-details-row">
              <span className="graph-details-k">Type</span>
              <span className="graph-details-v">{selectedNode.type}</span>
            </div>
            {selectedNode.details && (
              <div className="graph-details-row">
                <span className="graph-details-k">Telemetry</span>
                <span className="graph-details-v">{selectedNode.details}</span>
              </div>
            )}
            {selectedNode.isMemoryRelated && (
              <div className="graph-details-row memory-tag">
                <span className="graph-details-k">Hindsight</span>
                <span className="graph-details-v">Linked to prior recalled postmortem</span>
              </div>
            )}
            {selectedNode.state === 'root-cause' && diagnosis?.root_cause && (
              <div className="graph-details-rootcause">
                <strong>Diagnosis:</strong> {diagnosis.root_cause}
              </div>
            )}
          </div>

          <div className="graph-details-actions">
            {viewMode === '3d' && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setFocusPosition([...selectedNode.position])}
              >
                Focus Camera
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedNodeId(null)}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ── Footer Bar: Status, Memory Info & Legend ── */}
      <div className="graph-footer-bar">
        <div className="graph-footer-left">
          <span className="graph-overlay-label">
            {phase === 'idle'
              ? 'Topology'
              : phase === 'running'
              ? 'Investigating…'
              : phase === 'completed'
              ? 'Diagnosis complete'
              : 'Investigation failed'}
          </span>
          {memoryRecalled && memoryCount > 0 ? (
            <span className="graph-mem-pill memory-active" title="Hindsight recalled prior postmortem memory">
              ● {memoryCount} memor{memoryCount === 1 ? 'y' : 'ies'} recalled
            </span>
          ) : (
            <span className="graph-mem-pill memory-none" title="No prior memory recalled for this pattern">
              ○ No memory recalled
            </span>
          )}
        </div>

        <div className="graph-legend">
          <span className="leg-item"><span className="leg-dot leg-healthy" /> Healthy</span>
          <span className="leg-item"><span className="leg-dot leg-investigating" /> Investigating</span>
          <span className="leg-item"><span className="leg-dot leg-rootcause" /> Root cause</span>
          <span className="leg-item"><span className="leg-dot leg-memory" /> Memory</span>
        </div>
      </div>
    </div>
  );
}
