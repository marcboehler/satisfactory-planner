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

// Custom Miner Node Component (batch mode - simplified)
const MinerNode = memo(({ data }) => {
  const { itemName, requiredAmount, language } = data

  const buildingName = translateBuilding('Miner', language)
  const amountDisplay = Math.ceil(requiredAmount)

  return (
    <div className="miner-node">
      <Handle type="source" position={Position.Right} />
      <div className="node-content">
        <div className="node-title">{buildingName}</div>
        <div className="node-info">{itemName}</div>
        <div className="node-amount">{amountDisplay}x</div>
      </div>
    </div>
  )
})

// Recursive calculation of production chain (batch mode - absolute amounts)
function calculateProductionChain(itemId, targetAmount = 1, depth = 0, nodeIdCounter = { value: 0 }) {
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
      amount: targetAmount,
      depth: depth,
      isOre: true,
    })
    return result
  }

  // Calculate total amount needed
  // If recipe produces outputAmount per cycle, we need (targetAmount / outputAmount) cycles
  const outputPerCycle = recipe.outputAmount
  const cyclesNeeded = targetAmount / outputPerCycle

  // Create node for this building
  const nodeId = `node-${nodeIdCounter.value++}`
  result.nodes.push({
    id: nodeId,
    itemId: itemId,
    building: recipe.building,
    amount: targetAmount,
    depth: depth,
  })

  // Recursively calculate for each input
  for (const input of recipe.inputs) {
    // Total input amount needed = input per cycle * cycles needed
    const inputAmount = input.amount * cyclesNeeded

    const subChain = calculateProductionChain(
      input.itemId,
      inputAmount,
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
        label: `${Math.ceil(inputAmount)}x`,
        data: { amount: inputAmount },
      })
    }

    result.nodes.push(...subChain.nodes)
    result.edges.push(...subChain.edges)
  }

  return result
}

// Convert calculated chain to React Flow nodes (batch mode)
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
    const x = (maxDepth - node.depth) * 280 + 50
    const yOffset = node.isOre ? 140 : 100
    const y = depthIndex * yOffset + 50 + (depthIndex > 0 ? 20 : 0)

    const itemName = translateItem(node.itemId, lang)
    const amountDisplay = Math.ceil(node.amount)

    if (node.isOre) {
      // Get miner settings for this node
      const settings = minerSettings[node.id] || { tier: 'Mk.1', purity: 'normal' }

      flowNodes.push({
        id: node.id,
        type: 'minerNode',
        position: { x, y },
        data: {
          itemName,
          requiredAmount: node.amount,
          minerTier: settings.tier,
          purity: settings.purity,
          onTierChange,
          onPurityChange,
          language: lang,
        },
      })
    } else {
      const buildingName = translateBuilding(node.building, lang)

      flowNodes.push({
        id: node.id,
        type: 'default',
        position: { x, y },
        data: {
          label: (
            <div className="node-content">
              <div className="node-title">{buildingName}</div>
              <div className="node-info">{itemName}</div>
              <div className="node-amount">{amountDisplay}x</div>
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
  const [targetAmount, setTargetAmount] = useState(100)
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
    return calculateProductionChain(targetItem, targetAmount)
  }, [targetItem, targetAmount])

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
    return productionChain.edges.map(edge => ({
      ...edge,
      labelStyle: { fill: '#fff', fontWeight: 700, fontSize: 12 },
      labelBgStyle: { fill: '#e94560', fillOpacity: 0.9 },
      labelBgPadding: [4, 6],
      labelBgBorderRadius: 4,
    }))
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
            <h2>{translateUI('materials', language)}</h2>
          </div>
          <div className="amount-input">
            <label>{translateUI('targetAmount', language)}:</label>
            <p className="input-hint">{translateUI('howMuchToProduce', language)}</p>
            <input
              type="number"
              value={targetAmount}
              onChange={(e) => setTargetAmount(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              step="1"
            />
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
