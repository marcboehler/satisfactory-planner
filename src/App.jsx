import { useCallback } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const initialNodes = [
  {
    id: 'miner-1',
    type: 'default',
    position: { x: 50, y: 100 },
    data: {
      label: (
        <div className="node-content">
          <div className="node-title">Miner Mk.1</div>
          <div className="node-info">Iron Ore (Normal)</div>
          <div className="node-output">60/min</div>
        </div>
      ),
    },
  },
  {
    id: 'smelter-1',
    type: 'default',
    position: { x: 300, y: 100 },
    data: {
      label: (
        <div className="node-content">
          <div className="node-title">Smelter</div>
          <div className="node-info">Iron Ingot</div>
          <div className="node-output">30/min</div>
        </div>
      ),
    },
  },
  {
    id: 'constructor-1',
    type: 'default',
    position: { x: 550, y: 100 },
    data: {
      label: (
        <div className="node-content">
          <div className="node-title">Constructor</div>
          <div className="node-info">Iron Plate</div>
          <div className="node-output">20/min</div>
        </div>
      ),
    },
  },
  {
    id: 'miner-2',
    type: 'default',
    position: { x: 50, y: 250 },
    data: {
      label: (
        <div className="node-content">
          <div className="node-title">Miner Mk.2</div>
          <div className="node-info">Copper Ore (Pure)</div>
          <div className="node-output">240/min</div>
        </div>
      ),
    },
  },
  {
    id: 'smelter-2',
    type: 'default',
    position: { x: 300, y: 250 },
    data: {
      label: (
        <div className="node-content">
          <div className="node-title">Smelter x4</div>
          <div className="node-info">Copper Ingot</div>
          <div className="node-output">120/min</div>
        </div>
      ),
    },
  },
  {
    id: 'constructor-2',
    type: 'default',
    position: { x: 550, y: 250 },
    data: {
      label: (
        <div className="node-content">
          <div className="node-title">Constructor x2</div>
          <div className="node-info">Wire</div>
          <div className="node-output">90/min</div>
        </div>
      ),
    },
  },
]

const initialEdges = [
  { id: 'e1-2', source: 'miner-1', target: 'smelter-1', animated: true },
  { id: 'e2-3', source: 'smelter-1', target: 'constructor-1', animated: true },
  { id: 'e4-5', source: 'miner-2', target: 'smelter-2', animated: true },
  { id: 'e5-6', source: 'smelter-2', target: 'constructor-2', animated: true },
]

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  )

  return (
    <div className="app">
      <header className="header">
        <h1>Satisfactory Planner</h1>
        <span>Visual Production Chain Calculator</span>
      </header>
      <div className="flow-container">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Controls />
          <MiniMap
            nodeColor="#e94560"
            maskColor="rgba(0, 0, 0, 0.8)"
            style={{ background: '#16213e' }}
          />
          <Background variant="dots" gap={20} size={1} color="#333" />
        </ReactFlow>
      </div>
    </div>
  )
}
