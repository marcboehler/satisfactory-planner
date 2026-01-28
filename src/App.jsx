import { useCallback, useState, useMemo, memo } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  EdgeLabelRenderer,
  getSmoothStepPath,
  BaseEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
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
  'Manufacturer': 'https://satisfactory.wiki.gg/images/thumb/a/af/Manufacturer.png/200px-Manufacturer.png',
  'Foundry': 'https://satisfactory.wiki.gg/images/thumb/5/5b/Foundry.png/200px-Foundry.png',
  'Converter': 'https://satisfactory.wiki.gg/images/thumb/b/b2/Converter.png/200px-Converter.png',
  'WaterExtractor': 'https://satisfactory.wiki.gg/images/thumb/8/80/Water_Extractor.png/200px-Water_Extractor.png',
  'OilExtractor': 'https://satisfactory.wiki.gg/images/thumb/5/5d/Oil_Extractor.png/200px-Oil_Extractor.png',
  'ResourceWellExtractor': 'https://satisfactory.wiki.gg/images/thumb/3/39/Resource_Well_Pressurizer.png/200px-Resource_Well_Pressurizer.png',
  'Refinery': 'https://satisfactory.wiki.gg/images/thumb/f/fc/Refinery.png/200px-Refinery.png',
  'Blender': 'https://satisfactory.wiki.gg/images/thumb/5/5a/Blender.png/200px-Blender.png',
}

// Pipe tiers for liquids (m³/min)
const PIPE_TIERS = {
  'Mk.1': { capacity: 300, color: '#60a5fa', bgColor: '#1e40af' },
  'Mk.2': { capacity: 600, color: '#38bdf8', bgColor: '#0369a1' },
}

// Node dimensions for dagre layout
const NODE_WIDTH = 200
const NODE_HEIGHT = 280
const TITLE_SAFE_AREA = 80 // Reserved space at top for tier labels

// Tier background colors (matte dark palette)
const TIER_COLORS = [
  '#1e1e1e',   // Tier 1: Lightest (leftmost)
  '#1a1a1a',   // Tier 2
  '#161616',   // Tier 3
  '#121212',   // Tier 4
  '#0f0f0f',   // Tier 5: Darkest (rightmost)
  '#0c0c0c',   // Tier 6+
]

// Custom Edge with EdgeLabelRenderer for proper label positioning
const CustomEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  style,
  markerEnd,
}) => {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 15,
  })

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="edge-label"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY}px) translateY(-12px)`,
              pointerEvents: 'none',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

// Auto-layout function using dagre - returns nodes, edges, and tier info
function getLayoutedElements(nodes, edges, direction = 'LR') {
  if (nodes.length === 0) {
    return { nodes: [], edges, tierInfo: [] }
  }

  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 80,
    ranksep: 150,
    marginx: 50,
    marginy: 50,
  })

  // Add nodes with their calculated rank to control dagre positioning
  nodes.forEach((node) => {
    const nodeHeight = node.type === 'minerNode' ? NODE_HEIGHT + 40 : NODE_HEIGHT
    dagreGraph.setNode(node.id, {
      width: NODE_WIDTH,
      height: nodeHeight,
      // Use rank from topological calculation if available
      rank: node.data?.rank ?? 0,
    })
  })

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  dagre.layout(dagreGraph)

  // Calculate the X spacing for strict rank-based positioning
  const RANK_SPACING = 280 // Horizontal distance between ranks/tiers
  const START_X = 50

  // Calculate node positions - use dagre for Y, but override X based on topological rank
  let layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    const nodeHeight = node.type === 'minerNode' ? NODE_HEIGHT + 40 : NODE_HEIGHT
    const rank = node.data?.rank ?? 0

    // Override X position to strictly follow topological rank
    // This ensures miners (rank 0) are always in Tier 1 (leftmost)
    const strictX = START_X + rank * RANK_SPACING

    return {
      ...node,
      position: {
        x: strictX,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
      measured: {
        width: NODE_WIDTH,
        height: nodeHeight,
      },
      data: {
        ...node.data,
        rank,
      },
    }
  })

  // Group nodes by their topological rank (not x position)
  const tierMap = new Map()

  layoutedNodes.forEach((node) => {
    const rank = node.data?.rank ?? 0

    if (!tierMap.has(rank)) {
      tierMap.set(rank, {
        nodes: [],
        rank,
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
      })
    }

    const tier = tierMap.get(rank)
    tier.nodes.push(node)

    const nodeHeight = node.measured?.height || NODE_HEIGHT
    tier.minX = Math.min(tier.minX, node.position.x)
    tier.maxX = Math.max(tier.maxX, node.position.x + NODE_WIDTH)
    tier.minY = Math.min(tier.minY, node.position.y)
    tier.maxY = Math.max(tier.maxY, node.position.y + nodeHeight)
  })

  // Calculate global Y bounds for vertical centering
  let globalMinY = Infinity
  let globalMaxY = -Infinity
  tierMap.forEach((tier) => {
    globalMinY = Math.min(globalMinY, tier.minY)
    globalMaxY = Math.max(globalMaxY, tier.maxY)
  })
  const contentHeight = globalMaxY - globalMinY

  // Center each tier's nodes vertically, respecting the title safe area
  // Formula: Y_offset = TITLE_SAFE_AREA + (availableHeight - tierHeight) / 2
  tierMap.forEach((tier) => {
    const tierHeight = tier.maxY - tier.minY
    // Calculate available space below the safe area
    const availableHeight = contentHeight
    // Center within available space, then add safe area offset
    const yOffset = TITLE_SAFE_AREA + (availableHeight - tierHeight) / 2 - (tier.minY - globalMinY)

    // Sort nodes by Y position to assign vertical indices
    tier.nodes.sort((a, b) => a.position.y - b.position.y)

    tier.nodes.forEach((node, verticalIndex) => {
      node.position.y += yOffset
      // Add tier and position metadata for smart routing
      node.data = {
        ...node.data,
        tierIndex: tier.rank,
        verticalIndex,
        nodesInTierCount: tier.nodes.length,
      }
    })

    // Update tier bounds after centering
    tier.minY += yOffset
    tier.maxY += yOffset
  })

  // Convert to sorted array of tier info (sorted by rank)
  const tierInfo = Array.from(tierMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([rank, info]) => ({
      index: rank,
      rank,
      minX: info.minX,
      maxX: info.maxX,
      minY: info.minY,
      maxY: info.maxY,
      width: info.maxX - info.minX,
      height: info.maxY - info.minY,
      nodeCount: info.nodes.length,
    }))

  return { nodes: layoutedNodes, edges, tierInfo }
}

// Apply smart edge routing based on node positions
function applySmartEdgeRouting(nodes, edges) {
  // Create a map of node positions for quick lookup
  const nodeMap = new Map()
  nodes.forEach(node => {
    nodeMap.set(node.id, {
      y: node.position.y,
      height: node.measured?.height || NODE_HEIGHT,
      tierIndex: node.data?.tierIndex ?? 0,
      verticalIndex: node.data?.verticalIndex ?? 0,
    })
  })

  return edges.map(edge => {
    const sourceNode = nodeMap.get(edge.source)
    const targetNode = nodeMap.get(edge.target)

    if (!sourceNode || !targetNode) {
      return edge
    }

    // Calculate vertical centers
    const sourceCenter = sourceNode.y + sourceNode.height / 2
    const targetCenter = targetNode.y + targetNode.height / 2
    const verticalDiff = targetCenter - sourceCenter

    // Threshold for considering nodes at "same" level (within 50px)
    const SAME_LEVEL_THRESHOLD = 50

    let sourceHandle = 'right'
    let targetHandle = 'left'

    if (Math.abs(verticalDiff) <= SAME_LEVEL_THRESHOLD) {
      // Nodes are roughly at the same level - use horizontal routing
      sourceHandle = 'right'
      targetHandle = 'left'
    } else if (verticalDiff > 0) {
      // Target is BELOW source - route down
      sourceHandle = 'right'
      targetHandle = 'top'
    } else {
      // Target is ABOVE source - route up
      sourceHandle = 'right'
      targetHandle = 'bottom'
    }

    return {
      ...edge,
      type: 'custom',
      sourceHandle,
      targetHandle,
    }
  })
}

// Create tier background nodes from tier info
function createTierBackgroundNodes(tierInfo, language) {
  if (!tierInfo || tierInfo.length === 0) return []

  const padding = 25

  // Calculate global Y bounds - start from 0 to include title safe area
  const globalMinY = 0
  const globalMaxY = Math.max(...tierInfo.map(t => t.maxY)) + padding

  return tierInfo.map((tier, index) => {
    const colorIndex = index % TIER_COLORS.length
    // Use tier.rank if available, otherwise use index
    const tierNumber = (tier.rank ?? index) + 1

    // Simple rectangular columns - start at top (Y=0) to include title safe area
    const x = tier.minX - padding
    const width = tier.width + padding * 2
    const height = globalMaxY - globalMinY

    return {
      id: `tier-bg-${tierNumber}`,
      type: 'tierBackground',
      position: { x, y: globalMinY },
      data: {
        tierLabel: `Tier ${tierNumber}`,
        colorIndex,
        width,
        height,
      },
      selectable: false,
      draggable: false,
      connectable: false,
      zIndex: -1,
      style: {
        width,
        height,
        zIndex: -1,
      },
    }
  })
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

// Get minimum required pipe tier for a given liquid rate
function getRequiredPipeTier(rate) {
  for (const [tier, data] of Object.entries(PIPE_TIERS)) {
    if (rate <= data.capacity) {
      return { tier, ...data, isOverLimit: false }
    }
  }
  // Rate exceeds Mk.2
  return { tier: 'LIMIT', capacity: 600, color: '#ff4444', bgColor: '#991b1b', isOverLimit: true }
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

// Check if item is a liquid
function isLiquid(itemId) {
  const item = getItem(itemId)
  return item && item.isLiquid === true
}

// Check if item is a base liquid/gas source (water, crude oil, nitrogen gas - extracted, not produced)
function isLiquidSource(itemId) {
  return itemId === 'water' || itemId === 'crude-oil' || itemId === 'nitrogen-gas'
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

// Custom Miner/Extractor Node Component with tier/purity settings and time calculation
const MinerNode = memo(({ data, id }) => {
  const {
    itemName,
    itemIcon,
    requiredAmount,
    minerTier,
    purity,
    onTierChange,
    onPurityChange,
    language,
    buildingType = 'Miner',
    isLiquidSource = false,
  } = data

  const buildingName = translateBuilding(buildingType, language)
  const buildingImage = BUILDING_IMAGES[buildingType] || BUILDING_IMAGES['Miner']
  const amountDisplay = Math.ceil(requiredAmount)
  const outputPerMin = calculateMinerOutput(minerTier, purity)
  const miningTimeMinutes = requiredAmount / outputPerMin

  // Liquid sources show m³ instead of pieces
  const unitLabel = isLiquidSource ? 'm³' : 'x'
  const rateLabel = isLiquidSource ? 'm³/min' : '/min'

  return (
    <div className={`miner-node ${isLiquidSource ? 'liquid-extractor' : ''}`}>
      {/* Standard horizontal handle */}
      <Handle type="source" position={Position.Right} id="right" />
      {/* Vertical handles for smart routing */}
      <Handle type="source" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <div className="node-hero">
        <img src={buildingImage} alt={buildingName} className="building-image" />
      </div>
      <div className="node-content">
        <div className="node-title">{buildingName}</div>
        <div className="node-item-row">
          {itemIcon && <img src={itemIcon} alt={itemName} className="node-icon" />}
          <span className="node-info">{itemName}</span>
        </div>
        <div className="node-amount">{amountDisplay}{unitLabel}</div>

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
            <span className="stat-value">{outputPerMin}{rateLabel}</span>
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
      {/* Standard horizontal handles */}
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
      {/* Vertical handles for smart routing */}
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Bottom} id="bottom" />
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

// Tier Background Node Component
const TierBackgroundNode = memo(({ data }) => {
  const { tierLabel, colorIndex, width, height } = data
  const bgColor = TIER_COLORS[colorIndex] || TIER_COLORS[0]

  return (
    <div
      className="tier-background"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: bgColor,
      }}
    >
      <div className="tier-label">{tierLabel}</div>
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

  if (!recipe || isOre(itemId) || isLiquidSource(itemId)) {
    // Base case: ore, liquid source, or no recipe found - create an extractor node
    const nodeId = `node-${nodeIdCounter.value++}`
    let building = 'Miner'
    if (itemId === 'water') building = 'WaterExtractor'
    else if (itemId === 'crude-oil') building = 'OilExtractor'
    else if (itemId === 'nitrogen-gas') building = 'ResourceWellExtractor'

    result.nodes.push({
      id: nodeId,
      itemId: itemId,
      building: building,
      amount: targetAmount,
      depth: depth,
      isOre: isOre(itemId),
      isLiquidSource: isLiquidSource(itemId),
      isExtractor: true,
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
        data: { amount: inputAmount, itemId: input.itemId },
      })
    }

    result.nodes.push(...subChain.nodes)
    result.edges.push(...subChain.edges)
  }

  return result
}

// Calculate topological ranks for nodes (miners = rank 0, others = max(input ranks) + 1)
function calculateTopologicalRanks(chain) {
  const nodeMap = new Map()
  chain.nodes.forEach(node => nodeMap.set(node.id, { ...node, rank: null }))

  // Build adjacency map (target -> sources)
  const incomingEdges = new Map()
  chain.edges.forEach(edge => {
    if (!incomingEdges.has(edge.target)) {
      incomingEdges.set(edge.target, [])
    }
    incomingEdges.get(edge.target).push(edge.source)
  })

  // Initialize miners/extractors (nodes with no incoming edges or isOre/isExtractor) with rank 0
  nodeMap.forEach((node, id) => {
    if (node.isOre || node.isExtractor || !incomingEdges.has(id) || incomingEdges.get(id).length === 0) {
      node.rank = 0
    }
  })

  // Iteratively calculate ranks until all nodes have a rank
  let changed = true
  while (changed) {
    changed = false
    nodeMap.forEach((node, id) => {
      if (node.rank !== null) return

      const sources = incomingEdges.get(id) || []
      const sourceRanks = sources.map(srcId => nodeMap.get(srcId)?.rank)

      // Check if all sources have ranks
      if (sourceRanks.every(r => r !== null && r !== undefined)) {
        node.rank = Math.max(...sourceRanks) + 1
        changed = true
      }
    })
  }

  // Update original chain nodes with calculated ranks
  return chain.nodes.map(node => ({
    ...node,
    rank: nodeMap.get(node.id)?.rank ?? 0
  }))
}

// Convert calculated chain to React Flow nodes (batch mode)
function chainToFlowNodes(chain, lang, minerSettings, onTierChange, onPurityChange, productionTimeMinutes) {
  // First calculate topological ranks
  const rankedNodes = calculateTopologicalRanks(chain)

  // Group nodes by rank for positioning
  const rankGroups = {}
  rankedNodes.forEach(node => {
    if (!rankGroups[node.rank]) {
      rankGroups[node.rank] = []
    }
    rankGroups[node.rank].push(node)
  })

  const maxRank = Math.max(...rankedNodes.map(n => n.rank))
  const flowNodes = []

  rankedNodes.forEach(node => {
    const rankIndex = rankGroups[node.rank].indexOf(node)

    // Position: x based on rank (left to right), y based on index at that rank
    const x = node.rank * 320 + 50
    const yOffset = node.isOre ? 340 : 320
    const y = rankIndex * yOffset + 50

    const itemName = translateItem(node.itemId, lang)
    const amountDisplay = Math.ceil(node.amount)

    const item = getItem(node.itemId)
    const itemIcon = item?.icon || null

    if (node.isOre || node.isExtractor) {
      // Get miner/extractor settings for this node
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
          rank: node.rank,
          buildingType: node.building,
          isLiquidSource: node.isLiquidSource,
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
          rank: node.rank,
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
const categoryOrder = ['Ore', 'Ingot', 'Mineral', 'Liquid', 'Standard', 'Electronics', 'Industrial']
const categoryTranslations = {
  Ore: { de: 'Erze', en: 'Ores' },
  Ingot: { de: 'Barren', en: 'Ingots' },
  Mineral: { de: 'Mineralien', en: 'Minerals' },
  Liquid: { de: 'Flüssigkeiten', en: 'Liquids' },
  Standard: { de: 'Standard', en: 'Standard' },
  Electronics: { de: 'Elektronik', en: 'Electronics' },
  Industrial: { de: 'Industriezeile', en: 'Industrial' },
}

// Register custom node types
const nodeTypes = {
  minerNode: MinerNode,
  machineNode: MachineNode,
  tierBackground: TierBackgroundNode,
}

const edgeTypes = {
  custom: CustomEdge,
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

  // Convert to flow nodes and apply auto-layout
  const { layoutedNodes, layoutedEdges } = useMemo(() => {
    if (!productionChain) return { layoutedNodes: [], layoutedEdges: [] }

    const productionTime = productionTimeInfo?.totalMinutes || 1
    const nodes = chainToFlowNodes(productionChain, language, minerSettings, handleTierChange, handlePurityChange, productionTime)

    // Calculate edges for layout
    const totalMinutes = productionTimeInfo?.totalMinutes || 1
    const edges = productionChain.edges.map(edge => {
      const amount = edge.data?.amount || 0
      const itemId = edge.data?.itemId
      const requiredRate = amount / totalMinutes
      const itemIsLiquid = isLiquid(itemId)
      const item = getItem(itemId)
      const liquidColor = item?.color || '#3b82f6'

      // Use pipe tiers for liquids, belt tiers for solids
      const tierInfo = itemIsLiquid
        ? getRequiredPipeTier(requiredRate)
        : getRequiredBeltTier(requiredRate)

      // Liquid edges: thicker (4px), use item's color; Solid edges: normal (2px), orange
      const strokeWidth = itemIsLiquid ? 4 : 2
      const strokeColor = itemIsLiquid ? liquidColor : '#fa9549'
      const unitLabel = itemIsLiquid ? 'm³' : 'x'
      const labelColor = itemIsLiquid ? '#60a5fa' : '#fa9549'

      const baseStyle = {
        labelStyle: { fill: labelColor, fontWeight: 700, fontSize: 11 },
        labelBgPadding: [4, 6],
        labelBgBorderRadius: 4,
      }

      if (tierInfo.isOverLimit) {
        return {
          ...edge,
          ...baseStyle,
          label: `${Math.ceil(amount)}${unitLabel} | ${language === 'de' ? 'LIMIT!' : 'LIMIT!'} (${requiredRate.toFixed(0)}/min)`,
          labelStyle: { fill: '#fff', fontWeight: 700, fontSize: 11 },
          labelBgStyle: { fill: '#cc2200', fillOpacity: 1 },
          style: { stroke: '#ff4444', strokeWidth: 5 },
          animated: true,
          data: { ...edge.data, requiredRate, tier: tierInfo.tier, isOverLimit: true, isLiquid: itemIsLiquid },
        }
      }

      return {
        ...edge,
        ...baseStyle,
        label: `${Math.ceil(amount)}${unitLabel} (${itemIsLiquid ? 'Pipe ' : ''}${tierInfo.tier})`,
        labelBgStyle: { fill: '#1a1a1a', fillOpacity: 0.95 },
        style: { stroke: strokeColor, strokeWidth: strokeWidth },
        data: { ...edge.data, requiredRate, tier: tierInfo.tier, isOverLimit: false, isLiquid: itemIsLiquid },
      }
    })

    // Apply dagre auto-layout
    if (nodes.length > 0) {
      const { nodes: layouted, tierInfo } = getLayoutedElements(nodes, edges, 'LR')

      // Apply smart edge routing based on node positions
      const smartEdges = applySmartEdgeRouting(layouted, edges)

      // Create tier background nodes
      const tierBackgroundNodes = createTierBackgroundNodes(tierInfo, language)

      // Combine: tier backgrounds first (rendered behind), then regular nodes
      const allNodes = [...tierBackgroundNodes, ...layouted]

      return { layoutedNodes: allNodes, layoutedEdges: smartEdges }
    }

    return { layoutedNodes: nodes, layoutedEdges: edges }
  }, [productionChain, language, minerSettings, handleTierChange, handlePurityChange, productionTimeInfo])

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges)

  // Update nodes when language or target changes
  const handleLanguageChange = useCallback((newLang) => {
    setLanguage(newLang)
  }, [])

  // Update flow when production chain changes
  useMemo(() => {
    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges])

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
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{
              type: 'custom',
            }}
            nodesDraggable={false}
            nodesConnectable={false}
            snapToGrid={true}
            snapGrid={[20, 20]}
            fitView
          >
            <Controls showInteractive={false} />
            <Background variant="dots" gap={20} size={1} color="#2a2a2a" />
          </ReactFlow>
        </div>
      </div>
    </div>
  )
}
