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
import items from './data/items.json'
import recipes from './data/recipes.json'

// Translation helper functions
function translateBuilding(buildingId, lang) {
  const building = translations.buildings[buildingId]
  return building ? building[lang] : buildingId
}

function translateItem(itemId, lang) {
  // First try to find in items.json
  const item = items.find(i => i.id === itemId)
  if (item) return item[lang]
  // Fallback to translations.json
  const translatedItem = translations.items[itemId]
  return translatedItem ? translatedItem[lang] : itemId
}

function translateUI(key, lang) {
  const ui = translations.ui[key]
  return ui ? ui[lang] : key
}

// Get item by id
function getItem(itemId) {
  return items.find(i => i.id === itemId)
}

// Get recipe for an item
function getRecipeForItem(itemId) {
  return recipes.find(r => r.output === itemId)
}

// Check if item is a base ore (no recipe)
function isOre(itemId) {
  const item = getItem(itemId)
  return item && item.category === 'Ore'
}

// Recursive calculation of production chain
function calculateProductionChain(itemId, targetRate = 1, depth = 0, nodeIdCounter = { value: 0 }) {
  const result = {
    nodes: [],
    edges: [],
  }

  const recipe = getRecipeForItem(itemId)

  if (!recipe || isOre(itemId)) {
    // Base case: ore or no recipe found - create a miner node
    const nodeId = `node-${nodeIdCounter.value++}`
    result.nodes.push({
      id: nodeId,
      itemId: itemId,
      building: 'Miner',
      rate: targetRate,
      depth: depth,
      isOre: true,
    })
    return result
  }

  // Calculate how many cycles per minute we need
  const outputPerCycle = recipe.outputAmount
  const cyclesPerMinute = 60 / recipe.cycleTime
  const baseOutputPerMinute = outputPerCycle * cyclesPerMinute
  const machinesNeeded = targetRate / baseOutputPerMinute

  // Create node for this building
  const nodeId = `node-${nodeIdCounter.value++}`
  result.nodes.push({
    id: nodeId,
    itemId: itemId,
    building: recipe.building,
    rate: targetRate,
    machinesNeeded: machinesNeeded,
    depth: depth,
  })

  // Recursively calculate for each input
  for (const input of recipe.inputs) {
    const inputPerCycle = input.amount
    const inputPerMinute = inputPerCycle * cyclesPerMinute * machinesNeeded

    const subChain = calculateProductionChain(
      input.itemId,
      inputPerMinute,
      depth + 1,
      nodeIdCounter
    )

    // Connect the first node of the sub-chain to this node
    if (subChain.nodes.length > 0) {
      result.edges.push({
        id: `edge-${subChain.nodes[0].id}-${nodeId}`,
        source: subChain.nodes[0].id,
        target: nodeId,
        animated: true,
      })
    }

    result.nodes.push(...subChain.nodes)
    result.edges.push(...subChain.edges)
  }

  return result
}

// Convert calculated chain to React Flow nodes
function chainToFlowNodes(chain, lang) {
  // Group nodes by depth for positioning
  const depthGroups = {}
  chain.nodes.forEach(node => {
    if (!depthGroups[node.depth]) {
      depthGroups[node.depth] = []
    }
    depthGroups[node.depth].push(node)
  })

  const maxDepth = Math.max(...chain.nodes.map(n => n.depth))
  const flowNodes = []

  chain.nodes.forEach(node => {
    const depthIndex = depthGroups[node.depth].indexOf(node)
    const nodesAtDepth = depthGroups[node.depth].length

    // Position: x based on depth (right to left), y based on index at that depth
    const x = (maxDepth - node.depth) * 250 + 50
    const y = depthIndex * 120 + 50 + (depthIndex > 0 ? 20 : 0)

    const buildingName = translateBuilding(node.building, lang)
    const itemName = translateItem(node.itemId, lang)
    const rateDisplay = node.rate.toFixed(2).replace(/\.?0+$/, '')
    const machineInfo = node.machinesNeeded
      ? ` (${node.machinesNeeded.toFixed(2).replace(/\.?0+$/, '')}x)`
      : ''

    flowNodes.push({
      id: node.id,
      type: 'default',
      position: { x, y },
      data: {
        label: (
          <div className="node-content">
            <div className="node-title">{buildingName}{machineInfo}</div>
            <div className="node-info">{itemName}</div>
            <div className="node-output">{rateDisplay}/min</div>
          </div>
        ),
      },
    })
  })

  return flowNodes
}

// Group items by category
function groupItemsByCategory(itemsList) {
  const groups = {}
  itemsList.forEach(item => {
    if (!groups[item.category]) {
      groups[item.category] = []
    }
    groups[item.category].push(item)
  })
  return groups
}

// Category order and translations
const categoryOrder = ['Ore', 'Ingot', 'Basic', 'Advanced']
const categoryTranslations = {
  Ore: { de: 'Erze', en: 'Ores' },
  Ingot: { de: 'Barren', en: 'Ingots' },
  Basic: { de: 'Basis', en: 'Basic' },
  Advanced: { de: 'Fortgeschritten', en: 'Advanced' },
}

export default function App() {
  const [language, setLanguage] = useState('de')
  const [targetItem, setTargetItem] = useState(null)
  const [targetRate, setTargetRate] = useState(10)

  // Calculate production chain when target changes
  const productionChain = useMemo(() => {
    if (!targetItem) return null
    return calculateProductionChain(targetItem, targetRate)
  }, [targetItem, targetRate])

  // Convert to flow nodes
  const flowNodes = useMemo(() => {
    if (!productionChain) return []
    return chainToFlowNodes(productionChain, language)
  }, [productionChain, language])

  const flowEdges = useMemo(() => {
    if (!productionChain) return []
    return productionChain.edges
  }, [productionChain])

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges)

  // Update nodes when language or target changes
  const handleLanguageChange = useCallback((newLang) => {
    setLanguage(newLang)
  }, [])

  // Update flow when production chain changes
  useMemo(() => {
    setNodes(flowNodes)
    setEdges(flowEdges)
  }, [flowNodes, flowEdges, setNodes, setEdges])

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  )

  // Handle item selection
  const handleItemClick = useCallback((itemId) => {
    setTargetItem(itemId)
  }, [])

  // Group items for display
  const groupedItems = useMemo(() => groupItemsByCategory(items), [])

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
      <div className="main-content">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2>{language === 'de' ? 'Materialien' : 'Materials'}</h2>
          </div>
          <div className="rate-input">
            <label>{language === 'de' ? 'Zielrate' : 'Target Rate'}:</label>
            <input
              type="number"
              value={targetRate}
              onChange={(e) => setTargetRate(Math.max(1, parseFloat(e.target.value) || 1))}
              min="1"
              step="1"
            />
            <span>/min</span>
          </div>
          <div className="material-grid">
            {categoryOrder.map(category => (
              <div key={category} className="category-section">
                <h3 className="category-title">
                  {categoryTranslations[category][language]}
                </h3>
                <div className="category-items">
                  {(groupedItems[category] || []).map(item => (
                    <button
                      key={item.id}
                      className={`material-btn ${targetItem === item.id ? 'active' : ''}`}
                      onClick={() => handleItemClick(item.id)}
                      title={item[language]}
                    >
                      {item[language]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
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
    </div>
  )
}
