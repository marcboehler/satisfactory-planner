import { useCallback, useState, useMemo, memo } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import translations from './data/translations.json'
import items from './data/items.json'
import recipes from './data/recipes.json'

// Miner configuration constants
const MINER_TIERS = {
  'Mk.1': { baseRate: 60, de: 'Mk.1', en: 'Mk.1' },
  'Mk.2': { baseRate: 120, de: 'Mk.2', en: 'Mk.2' },
  'Mk.3': { baseRate: 240, de: 'Mk.3', en: 'Mk.3' },
}

const PURITY_LEVELS = {
  impure: { multiplier: 0.5, de: 'Unrein', en: 'Impure' },
  normal: { multiplier: 1.0, de: 'Normal', en: 'Normal' },
  pure: { multiplier: 2.0, de: 'Rein', en: 'Pure' },
}

// Calculate miner output based on tier and purity
function calculateMinerOutput(tier, purity) {
  const tierData = MINER_TIERS[tier]
  const purityData = PURITY_LEVELS[purity]
  return tierData.baseRate * purityData.multiplier
}

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

// Custom Miner Node Component
const MinerNode = memo(({ data, id }) => {
  const {
    itemName,
    requiredRate,
    minerTier,
    purity,
    onTierChange,
    onPurityChange,
    language
  } = data

  const currentOutput = calculateMinerOutput(minerTier, purity)
  const minersNeeded = Math.ceil(requiredRate / currentOutput)
  const totalOutput = currentOutput * minersNeeded
  const isOverloaded = requiredRate > totalOutput || minersNeeded > 1

  const buildingName = translateBuilding('Miner', language)

  return (
    <div className={`miner-node ${isOverloaded ? 'overloaded' : ''}`}>
      <Handle type="source" position={Position.Right} />
      <div className="node-content">
        <div className="node-title">{buildingName}</div>
        <div className="node-info">{itemName}</div>

        <div className="miner-controls">
          <div className="miner-select-group">
            <label>{language === 'de' ? 'Stufe' : 'Tier'}:</label>
            <select
              value={minerTier}
              onChange={(e) => onTierChange(id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
            >
              {Object.keys(MINER_TIERS).map(tier => (
                <option key={tier} value={tier}>
                  {MINER_TIERS[tier][language]}
                </option>
              ))}
            </select>
          </div>

          <div className="miner-select-group">
            <label>{language === 'de' ? 'Reinheit' : 'Purity'}:</label>
            <select
              value={purity}
              onChange={(e) => onPurityChange(id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
            >
              {Object.keys(PURITY_LEVELS).map(p => (
                <option key={p} value={p}>
                  {PURITY_LEVELS[p][language]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="miner-stats">
          <div className="node-output">
            {language === 'de' ? 'Kapazität' : 'Capacity'}: {currentOutput}/min
          </div>
          <div className={`node-demand ${isOverloaded ? 'demand-warning' : ''}`}>
            {language === 'de' ? 'Bedarf' : 'Demand'}: {requiredRate.toFixed(2).replace(/\.?0+$/, '')}/min
          </div>
          {minersNeeded > 1 && (
            <div className="miners-needed">
              {language === 'de' ? 'Benötigt' : 'Required'}: {minersNeeded}x Miner
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

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
function chainToFlowNodes(chain, lang, minerSettings, onTierChange, onPurityChange) {
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

    // Position: x based on depth (right to left), y based on index at that depth
    // Miner nodes need more vertical space due to controls
    const x = (maxDepth - node.depth) * 280 + 50
    const yOffset = node.isOre ? 180 : 120
    const y = depthIndex * yOffset + 50 + (depthIndex > 0 ? 20 : 0)

    const itemName = translateItem(node.itemId, lang)

    if (node.isOre) {
      // Get miner settings for this node
      const settings = minerSettings[node.id] || { tier: 'Mk.1', purity: 'normal' }

      flowNodes.push({
        id: node.id,
        type: 'minerNode',
        position: { x, y },
        data: {
          itemName,
          requiredRate: node.rate,
          minerTier: settings.tier,
          purity: settings.purity,
          onTierChange,
          onPurityChange,
          language: lang,
        },
      })
    } else {
      const buildingName = translateBuilding(node.building, lang)
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
    }
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

// Register custom node types
const nodeTypes = {
  minerNode: MinerNode,
}

export default function App() {
  const [language, setLanguage] = useState('de')
  const [targetItem, setTargetItem] = useState(null)
  const [targetRate, setTargetRate] = useState(10)
  const [minerSettings, setMinerSettings] = useState({})

  // Handlers for miner settings changes
  const handleTierChange = useCallback((nodeId, newTier) => {
    setMinerSettings(prev => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], tier: newTier, purity: prev[nodeId]?.purity || 'normal' }
    }))
  }, [])

  const handlePurityChange = useCallback((nodeId, newPurity) => {
    setMinerSettings(prev => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], purity: newPurity, tier: prev[nodeId]?.tier || 'Mk.1' }
    }))
  }, [])

  // Calculate production chain when target changes
  const productionChain = useMemo(() => {
    if (!targetItem) return null
    return calculateProductionChain(targetItem, targetRate)
  }, [targetItem, targetRate])

  // Initialize miner settings for new ore nodes
  useMemo(() => {
    if (productionChain) {
      const oreNodes = productionChain.nodes.filter(n => n.isOre)
      setMinerSettings(prev => {
        const newSettings = { ...prev }
        oreNodes.forEach(node => {
          if (!newSettings[node.id]) {
            newSettings[node.id] = { tier: 'Mk.1', purity: 'normal' }
          }
        })
        return newSettings
      })
    }
  }, [productionChain])

  // Convert to flow nodes
  const flowNodes = useMemo(() => {
    if (!productionChain) return []
    return chainToFlowNodes(productionChain, language, minerSettings, handleTierChange, handlePurityChange)
  }, [productionChain, language, minerSettings, handleTierChange, handlePurityChange])

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
            nodeTypes={nodeTypes}
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
