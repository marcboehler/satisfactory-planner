import { useCallback, useState, useMemo } from 'react'
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
import translations from './data/translations.json'

// Node data with IDs - keeps calculations separate from display
const nodeData = [
  {
    id: 'miner-1',
    buildingType: 'Miner',
    buildingSuffix: 'Mk.1',
    itemId: 'Iron Ore',
    itemSuffix: '(Normal)',
    output: 60,
    position: { x: 50, y: 100 },
  },
  {
    id: 'smelter-1',
    buildingType: 'Smelter',
    buildingSuffix: '',
    itemId: 'Iron Ingot',
    itemSuffix: '',
    output: 30,
    position: { x: 300, y: 100 },
  },
  {
    id: 'constructor-1',
    buildingType: 'Constructor',
    buildingSuffix: '',
    itemId: 'Iron Plate',
    itemSuffix: '',
    output: 20,
    position: { x: 550, y: 100 },
  },
  {
    id: 'miner-2',
    buildingType: 'Miner',
    buildingSuffix: 'Mk.2',
    itemId: 'Copper Ore',
    itemSuffix: '(Pure)',
    output: 240,
    position: { x: 50, y: 250 },
  },
  {
    id: 'smelter-2',
    buildingType: 'Smelter',
    buildingSuffix: 'x4',
    itemId: 'Copper Ingot',
    itemSuffix: '',
    output: 120,
    position: { x: 300, y: 250 },
  },
  {
    id: 'constructor-2',
    buildingType: 'Constructor',
    buildingSuffix: 'x2',
    itemId: 'Wire',
    itemSuffix: '',
    output: 90,
    position: { x: 550, y: 250 },
  },
]

const initialEdges = [
  { id: 'e1-2', source: 'miner-1', target: 'smelter-1', animated: true },
  { id: 'e2-3', source: 'smelter-1', target: 'constructor-1', animated: true },
  { id: 'e4-5', source: 'miner-2', target: 'smelter-2', animated: true },
  { id: 'e5-6', source: 'smelter-2', target: 'constructor-2', animated: true },
]

// Translation helper functions
function translateBuilding(buildingId, lang) {
  const building = translations.buildings[buildingId]
  return building ? building[lang] : buildingId
}

function translateItem(itemId, lang) {
  const item = translations.items[itemId]
  return item ? item[lang] : itemId
}

function translateUI(key, lang) {
  const ui = translations.ui[key]
  return ui ? ui[lang] : key
}

// Create React Flow nodes from data with translations
function createNodes(data, lang) {
  return data.map((node) => {
    const buildingName = translateBuilding(node.buildingType, lang)
    const itemName = translateItem(node.itemId, lang)
    const suffix = node.buildingSuffix ? ` ${node.buildingSuffix}` : ''
    const itemSuffix = node.itemSuffix ? ` ${node.itemSuffix}` : ''

    return {
      id: node.id,
      type: 'default',
      position: node.position,
      data: {
        label: (
          <div className="node-content">
            <div className="node-title">{buildingName}{suffix}</div>
            <div className="node-info">{itemName}{itemSuffix}</div>
            <div className="node-output">{node.output}/min</div>
          </div>
        ),
      },
    }
  })
}

export default function App() {
  const [language, setLanguage] = useState('de')

  // Create initial nodes with current language
  const initialNodes = useMemo(() => createNodes(nodeData, language), [language])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Update nodes when language changes
  const handleLanguageChange = useCallback((newLang) => {
    setLanguage(newLang)
    setNodes((currentNodes) => {
      // Preserve positions from current nodes
      const positionMap = {}
      currentNodes.forEach((n) => {
        positionMap[n.id] = n.position
      })

      // Create new nodes with updated language
      return nodeData.map((node) => {
        const buildingName = translateBuilding(node.buildingType, newLang)
        const itemName = translateItem(node.itemId, newLang)
        const suffix = node.buildingSuffix ? ` ${node.buildingSuffix}` : ''
        const itemSuffix = node.itemSuffix ? ` ${node.itemSuffix}` : ''

        return {
          id: node.id,
          type: 'default',
          position: positionMap[node.id] || node.position,
          data: {
            label: (
              <div className="node-content">
                <div className="node-title">{buildingName}{suffix}</div>
                <div className="node-info">{itemName}{itemSuffix}</div>
                <div className="node-output">{node.output}/min</div>
              </div>
            ),
          },
        }
      })
    })
  }, [setNodes])

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  )

  return (
    <div className="app">
      <header className="header">
        <h1>{translateUI('title', language)}</h1>
        <span>{translateUI('subtitle', language)}</span>
        <div className="language-switcher">
          <button
            className={`lang-btn ${language === 'de' ? 'active' : ''}`}
            onClick={() => handleLanguageChange('de')}
          >
            DE
          </button>
          <button
            className={`lang-btn ${language === 'en' ? 'active' : ''}`}
            onClick={() => handleLanguageChange('en')}
          >
            EN
          </button>
        </div>
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
