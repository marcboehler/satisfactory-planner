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
import { Menu, X, ChevronLeft, ChevronRight } from 'lucide-react'
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

// Conveyor belt configuration constants with colors
const BELT_TIERS = {
  'Mk.1': { capacity: 60, color: '#888888', bgColor: '#555555' },
  'Mk.2': { capacity: 120, color: '#aaaaaa', bgColor: '#666666' },
  'Mk.3': { capacity: 270, color: '#60a5fa', bgColor: '#1e40af' },
  'Mk.4': { capacity: 480, color: '#38bdf8', bgColor: '#0369a1' },
  'Mk.5': { capacity: 780, color: '#a78bfa', bgColor: '#6d28d9' },
  'Mk.6': { capacity: 1200, color: '#fb923c', bgColor: '#c2410c' },
}

// Building images from Satisfactory Wiki
const BUILDING_IMAGES = {
  'Miner': 'https://satisfactory.wiki.gg/images/thumb/4/43/Miner_Mk.1.png/200px-Miner_Mk.1.png',
  'Smelter': 'https://satisfactory.wiki.gg/images/thumb/3/30/Smelter.png/200px-Smelter.png',
  'Constructor': 'https://satisfactory.wiki.gg/images/thumb/1/1a/Constructor.png/200px-Constructor.png',
  'Assembler': 'https://satisfactory.wiki.gg/images/thumb/d/dc/Assembler.png/200px-Assembler.png',
}

// Get minimum required belt tier for a given rate
function getRequiredBeltTier(rate) {
  for (const [tier, data] of Object.entries(BELT_TIERS)) {
    if (rate <= data.capacity) {
      return { tier, ...data, isOverLimit: false }
    }
  }
  // Rate exceeds Mk.6
  return { tier: 'LIMIT', capacity: 1200, color: '#ff4444', bgColor: '#991b1b', isOverLimit: true }
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

// Helper to translate miner-specific strings
function translateMiner(key, lang) {
  const miner = translations.miner[key]
  return miner ? miner[lang] : key
}

// Format time in minutes or hours
function formatTime(minutes, lang) {
  if (minutes < 60) {
    return `${minutes.toFixed(1)} ${translateUI('minutes', lang)}`
  }
  const hours = minutes / 60
  return `${hours.toFixed(1)} ${translateUI('hours', lang)}`
}

// Calculate standard production rate per machine (items per minute)
function calculateMachineRate(recipe) {
  if (!recipe) return 0
  return (recipe.outputAmount / recipe.cycleTime) * 60
}

// Calculate number of machines needed
function calculateMachinesNeeded(amount, productionTimeMinutes, recipe) {
  if (!recipe || productionTimeMinutes <= 0) return { rounded: 1, exact: 1 }

  const requiredRate = amount / productionTimeMinutes  // items per minute needed
  const machineRate = calculateMachineRate(recipe)     // items per minute per machine
  const exactMachines = requiredRate / machineRate

  return {
    rounded: Math.ceil(exactMachines),
    exact: exactMachines
  }
}

// Custom Miner Node Component with tier/purity settings and time calculation
const MinerNode = memo(({ data, id }) => {
  const {
    itemName,
    itemIcon,
    requiredAmount,
    minerTier,
    purity,
    onTierChange,
    onPurityChange,
    language
  } = data

  const buildingName = translateBuilding('Miner', language)
  const buildingImage = BUILDING_IMAGES['Miner']
  const amountDisplay = Math.ceil(requiredAmount)
  const outputPerMin = calculateMinerOutput(minerTier, purity)
  const miningTimeMinutes = requiredAmount / outputPerMin

  return (
    <div className="miner-node">
      <Handle type="source" position={Position.Right} />
      <div className="node-hero">
        <img src={buildingImage} alt={buildingName} className="building-image" />
      </div>
      <div className="node-content">
        <div className="node-title">{buildingName}</div>
        <div className="node-item-row">
          {itemIcon && <img src={itemIcon} alt={itemName} className="node-icon" />}
          <span className="node-info">{itemName}</span>
        </div>
        <div className="node-amount">{amountDisplay}x</div>

        <div className="miner-controls">
          <div className="miner-select-group">
            <label>{translateMiner('tier', language)}:</label>
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
            <label>{translateMiner('purity', language)}:</label>
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
          <div className="stat-row">
            <span className="stat-label">{translateMiner('outputPerMin', language)}:</span>
            <span className="stat-value">{outputPerMin}/min</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">{translateMiner('miningTime', language)}:</span>
            <span className="stat-value time-value">{formatTime(miningTimeMinutes, language)}</span>
          </div>
        </div>

        <div className="overclock-preview">
          <div className="overclock-label">
            <span>{translateUI('overclock', language)}:</span>
            <span className="overclock-value">100%</span>
          </div>
          <div className="overclock-slider-disabled">
            <div className="overclock-track">
              <div className="overclock-fill" style={{ width: '50%' }}></div>
            </div>
          </div>
          <div className="overclock-hint">
            {language === 'de' ? 'Bald verfügbar' : 'Coming soon'}
          </div>
        </div>
      </div>
    </div>
  )
})

// Custom Machine Node Component with machine count calculation
const MachineNode = memo(({ data }) => {
  const {
    buildingName,
    buildingType,
    itemName,
    itemIcon,
    amount,
    machineCount,
    exactMachineCount,
    machineRate,
    language
  } = data

  const buildingImage = BUILDING_IMAGES[buildingType]
  const showExact = exactMachineCount && Math.abs(machineCount - exactMachineCount) > 0.01

  return (
    <div className="machine-node">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="node-hero">
        <img src={buildingImage} alt={buildingName} className="building-image" />
      </div>
      <div className="node-content">
        <div className="node-header">
          <span className="node-title">{buildingName}</span>
          <span className="machine-count">x{machineCount}</span>
        </div>
        <div className="node-item-row">
          {itemIcon && <img src={itemIcon} alt={itemName} className="node-icon" />}
          <span className="node-info">{itemName}</span>
        </div>
        <div className="node-amount">{amount}x</div>

        <div className="machine-stats">
          <div className="stat-row">
            <span className="stat-label">{translateUI('machineRate', language)}:</span>
            <span className="stat-value">{machineRate.toFixed(1)}/min</span>
          </div>
          {showExact && (
            <div className="stat-row exact-row">
              <span className="stat-label">{translateUI('exact', language)}:</span>
              <span className="stat-value exact-value">{exactMachineCount.toFixed(2)}</span>
            </div>
          )}
        </div>

        <div className="overclock-preview">
          <div className="overclock-label">
            <span>{translateUI('overclock', language)}:</span>
            <span className="overclock-value">100%</span>
          </div>
          <div className="overclock-slider-disabled">
            <div className="overclock-track">
              <div className="overclock-fill" style={{ width: '50%' }}></div>
            </div>
          </div>
          <div className="overclock-hint">
            {language === 'de' ? 'Bald verfügbar' : 'Coming soon'}
          </div>
        </div>
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
function chainToFlowNodes(chain, lang, minerSettings, onTierChange, onPurityChange, productionTimeMinutes) {
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
    // Both node types now have hero images, so need more vertical space
    const x = (maxDepth - node.depth) * 320 + 50
    const yOffset = node.isOre ? 340 : 320
    const y = depthIndex * yOffset + 50

    const itemName = translateItem(node.itemId, lang)
    const amountDisplay = Math.ceil(node.amount)

    const item = getItem(node.itemId)
    const itemIcon = item?.icon || null

    if (node.isOre) {
      // Get miner settings for this node
      const settings = minerSettings[node.id] || { tier: 'Mk.1', purity: 'normal' }

      flowNodes.push({
        id: node.id,
        type: 'minerNode',
        position: { x, y },
        data: {
          itemName,
          itemIcon,
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
      const recipe = getRecipeForItem(node.itemId)
      const machineRate = calculateMachineRate(recipe)
      const machineInfo = calculateMachinesNeeded(node.amount, productionTimeMinutes, recipe)

      flowNodes.push({
        id: node.id,
        type: 'machineNode',
        position: { x, y },
        data: {
          buildingName,
          buildingType: node.building,
          itemName,
          itemIcon,
          amount: amountDisplay,
          machineCount: machineInfo.rounded,
          exactMachineCount: machineInfo.exact,
          machineRate: machineRate,
          language: lang,
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
  machineNode: MachineNode,
}

// Check if we're on desktop (>= 768px)
const getInitialSidebarState = () => {
  if (typeof window === 'undefined') return true
  return window.innerWidth >= 768
}

export default function App() {
  const [language, setLanguage] = useState('de')
  const [targetItem, setTargetItem] = useState(null)
  const [targetAmount, setTargetAmount] = useState(100)
  const [minerSettings, setMinerSettings] = useState({})
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarState)

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

  // Calculate estimated production time based on slowest miner (bottleneck)
  const productionTimeInfo = useMemo(() => {
    if (!productionChain) return null

    const oreNodes = productionChain.nodes.filter(n => n.isOre)
    if (oreNodes.length === 0) return null

    let maxTime = 0
    let bottleneckItem = null

    oreNodes.forEach(node => {
      const settings = minerSettings[node.id] || { tier: 'Mk.1', purity: 'normal' }
      const outputPerMin = calculateMinerOutput(settings.tier, settings.purity)
      const miningTime = node.amount / outputPerMin

      if (miningTime > maxTime) {
        maxTime = miningTime
        bottleneckItem = node.itemId
      }
    })

    return {
      totalMinutes: maxTime,
      bottleneckItem,
    }
  }, [productionChain, minerSettings])

  // Convert to flow nodes
  const flowNodes = useMemo(() => {
    if (!productionChain) return []
    const productionTime = productionTimeInfo?.totalMinutes || 1
    return chainToFlowNodes(productionChain, language, minerSettings, handleTierChange, handlePurityChange, productionTime)
  }, [productionChain, language, minerSettings, handleTierChange, handlePurityChange, productionTimeInfo])

  // Calculate required belt rates and determine minimum belt tier per edge
  const flowEdges = useMemo(() => {
    if (!productionChain) return []

    const totalMinutes = productionTimeInfo?.totalMinutes || 1

    return productionChain.edges.map(edge => {
      const amount = edge.data?.amount || 0
      const requiredRate = amount / totalMinutes
      const beltInfo = getRequiredBeltTier(requiredRate)

      const baseStyle = {
        labelStyle: { fill: '#fa9549', fontWeight: 700, fontSize: 11 },
        labelBgPadding: [4, 6],
        labelBgBorderRadius: 4,
      }

      if (beltInfo.isOverLimit) {
        // Rate exceeds Mk.6 - show warning
        return {
          ...edge,
          ...baseStyle,
          label: `${Math.ceil(amount)}x | ${language === 'de' ? 'LIMIT!' : 'LIMIT!'} (${requiredRate.toFixed(0)}/min)`,
          labelStyle: { fill: '#fff', fontWeight: 700, fontSize: 11 },
          labelBgStyle: { fill: '#cc2200', fillOpacity: 1 },
          style: { stroke: '#ff4444', strokeWidth: 5 },
          animated: true,
          data: {
            ...edge.data,
            requiredRate,
            beltTier: beltInfo.tier,
            isOverLimit: true,
          },
        }
      }

      return {
        ...edge,
        ...baseStyle,
        label: `${Math.ceil(amount)}x (${beltInfo.tier})`,
        labelBgStyle: { fill: '#1a1a1a', fillOpacity: 0.95 },
        style: { stroke: '#fa9549', strokeWidth: 2 },
        data: {
          ...edge.data,
          requiredRate,
          beltTier: beltInfo.tier,
          isOverLimit: false,
        },
      }
    })
  }, [productionChain, productionTimeInfo, language])

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
    setSidebarOpen(false) // Close sidebar on mobile after selection
  }, [])

  // Group items for display
  const groupedItems = useMemo(() => groupItemsByCategory(items), [])

  return (
    <div className="app">
      <header className="header">
        <button
          className="menu-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <h1>{translateUI('title', language)}</h1>
        <span className="header-subtitle">{translateUI('subtitle', language)}</span>
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
        {sidebarOpen && (
          <div
            className="sidebar-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <h2>{translateUI('materials', language)}</h2>
            <button
              className="sidebar-close"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={20} />
            </button>
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
          {productionTimeInfo && (
            <div className="time-display">
              <label>{translateUI('estimatedTime', language)}:</label>
              <div className="time-value-large">
                {formatTime(productionTimeInfo.totalMinutes, language)}
              </div>
              {productionTimeInfo.bottleneckItem && (
                <div className="bottleneck-info">
                  <span className="bottleneck-label">{translateUI('bottleneck', language)}:</span>
                  <span className="bottleneck-item">{translateItem(productionTimeInfo.bottleneckItem, language)}</span>
                </div>
              )}
            </div>
          )}
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
                      {item.icon && <img src={item.icon} alt={item[language]} className="material-icon" />}
                      <span className="material-name">{item[language]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
        <button
          className="sidebar-toggle-desktop"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
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
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor="#fa9549"
              maskColor="rgba(0, 0, 0, 0.85)"
              style={{ background: '#1a1a1a' }}
            />
            <Background variant="dots" gap={20} size={1} color="#2a2a2a" />
          </ReactFlow>
        </div>
      </div>
    </div>
  )
}
