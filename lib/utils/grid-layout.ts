// =============================================
// Grid Layout Utilities
// =============================================
// Custom utilities for react-grid-layout with allowOverlap mode
// Features:
// - Fills horizontal gaps when panels are resized or removed
// - Calculates grid height based on panel layout
// - Overlap-based swap: resolves panel overlaps by swapping positions
//
// Key approach: With allowOverlap=true, RGL doesn't push panels.
// We detect overlaps after drag and resolve by swapping positions.

import type { LayoutItem, SwapResult } from "@/types/workboard";

// =============================================
// Types
// =============================================

/** Cell in the occupancy grid (true = occupied) */
type OccupancyGrid = boolean[][];

// =============================================
// Occupancy Grid Functions
// =============================================

/**
 * Create an occupancy grid from layout items
 * The grid tracks which cells are occupied by panels
 * @param layout - Current layout items
 * @param cols - Number of columns in grid
 * @param maxRows - Maximum rows to track (auto-calculated if not provided)
 */
function createOccupancyGrid(
  layout: LayoutItem[],
  cols: number,
  maxRows?: number
): OccupancyGrid {
  // Calculate max rows needed based on layout
  const calculatedMaxRows = layout.reduce((max, item) => {
    return Math.max(max, item.y + item.h);
  }, 0);

  const rows = maxRows ?? Math.max(calculatedMaxRows, 10); // At least 10 rows

  // Initialize empty grid (all cells false = unoccupied)
  const grid: OccupancyGrid = Array(rows)
    .fill(null)
    .map(() => Array(cols).fill(false));

  // Mark cells occupied by each layout item
  layout.forEach((item) => {
    for (let row = item.y; row < item.y + item.h && row < rows; row++) {
      for (let col = item.x; col < item.x + item.w && col < cols; col++) {
        grid[row][col] = true;
      }
    }
  });

  return grid;
}

/**
 * Count empty columns to the right of a panel
 * Checks all rows that the panel occupies
 */
function countEmptyColumnsToRight(
  grid: OccupancyGrid,
  item: LayoutItem,
  cols: number
): number {
  const rightEdge = item.x + item.w; // Column after panel's right edge

  if (rightEdge >= cols) return 0; // Already at grid edge

  // Find the maximum continuous empty space to the right
  let emptyCount = 0;

  for (let col = rightEdge; col < cols; col++) {
    let columnEmpty = true;

    // Check all rows that this panel spans
    for (let row = item.y; row < item.y + item.h && row < grid.length; row++) {
      if (grid[row][col]) {
        columnEmpty = false;
        break;
      }
    }

    if (columnEmpty) {
      emptyCount++;
    } else {
      break; // Stop at first occupied column
    }
  }

  return emptyCount;
}

/**
 * Count empty columns to the left of a panel
 * Used for expanding panels leftward
 */
function countEmptyColumnsToLeft(
  grid: OccupancyGrid,
  item: LayoutItem
): number {
  if (item.x <= 0) return 0; // Already at left edge

  let emptyCount = 0;

  // Check columns from right-to-left starting at panel's left edge
  for (let col = item.x - 1; col >= 0; col--) {
    let columnEmpty = true;

    for (let row = item.y; row < item.y + item.h && row < grid.length; row++) {
      if (grid[row][col]) {
        columnEmpty = false;
        break;
      }
    }

    if (columnEmpty) {
      emptyCount++;
    } else {
      break;
    }
  }

  return emptyCount;
}

// =============================================
// Auto-Fill Algorithm
// =============================================

/**
 * Compact layout and fill horizontal gaps
 * Main auto-fill function that expands panels to fill empty space
 *
 * Algorithm:
 * 1. Sort panels by position (top-left first)
 * 2. For each panel, check for empty space to the right
 * 3. Expand width to fill the gap (respecting maxW)
 * 4. Rebuild occupancy grid after each expansion
 *
 * @param layout - Current layout items
 * @param cols - Number of grid columns (default: 12)
 * @returns New layout with gaps filled
 */
export function compactAndFill(
  layout: LayoutItem[],
  cols: number = 12
): LayoutItem[] {
  if (layout.length === 0) return layout;

  // Clone layout to avoid mutation
  let newLayout = layout.map((item) => ({ ...item }));

  // Sort by position: top-to-bottom, then left-to-right
  newLayout.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  // Process each panel for horizontal gap filling
  for (let i = 0; i < newLayout.length; i++) {
    const item = newLayout[i];

    // Rebuild occupancy grid excluding current item
    const otherItems = newLayout.filter((_, idx) => idx !== i);
    const grid = createOccupancyGrid(otherItems, cols);

    // Check for empty space to the right
    const emptyRight = countEmptyColumnsToRight(grid, item, cols);

    if (emptyRight > 0) {
      // Calculate new width (respect maxW if set)
      const maxWidth = item.maxW ?? cols;
      const newWidth = Math.min(item.w + emptyRight, maxWidth);

      // Update item width
      newLayout[i] = { ...item, w: newWidth };
    }
  }

  return newLayout;
}

/**
 * Bidirectional gap filling - expands both left and right
 * More aggressive filling strategy
 *
 * @param layout - Current layout items
 * @param cols - Number of grid columns
 * @returns New layout with gaps filled in both directions
 */
export function compactAndFillBidirectional(
  layout: LayoutItem[],
  cols: number = 12
): LayoutItem[] {
  if (layout.length === 0) return layout;

  // Clone layout
  let newLayout = layout.map((item) => ({ ...item }));

  // Sort by position
  newLayout.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  // First pass: fill to the left (move items left and expand)
  for (let i = 0; i < newLayout.length; i++) {
    const item = newLayout[i];
    const otherItems = newLayout.filter((_, idx) => idx !== i);
    const grid = createOccupancyGrid(otherItems, cols);

    // Check empty space to the left
    const emptyLeft = countEmptyColumnsToLeft(grid, item);

    if (emptyLeft > 0) {
      // Move item left and expand
      const minWidth = item.minW ?? 1;
      newLayout[i] = {
        ...item,
        x: item.x - emptyLeft,
        w: item.w + emptyLeft,
      };
    }
  }

  // Second pass: fill to the right
  for (let i = 0; i < newLayout.length; i++) {
    const item = newLayout[i];
    const otherItems = newLayout.filter((_, idx) => idx !== i);
    const grid = createOccupancyGrid(otherItems, cols);

    const emptyRight = countEmptyColumnsToRight(grid, item, cols);

    if (emptyRight > 0) {
      const maxWidth = item.maxW ?? cols;
      const newWidth = Math.min(item.w + emptyRight, maxWidth);
      newLayout[i] = { ...item, w: newWidth };
    }
  }

  return newLayout;
}

/**
 * Check if layout has any horizontal gaps
 * Useful for detecting when auto-fill should run
 *
 * @param layout - Current layout
 * @param cols - Number of columns
 * @returns true if gaps exist
 */
export function hasHorizontalGaps(
  layout: LayoutItem[],
  cols: number = 12
): boolean {
  if (layout.length === 0) return false;

  const grid = createOccupancyGrid(layout, cols);

  // Find the maximum row occupied
  const maxRow = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);

  // Check each row for gaps (empty columns between occupied columns)
  for (let row = 0; row < maxRow; row++) {
    let foundOccupied = false;
    let foundGap = false;

    for (let col = 0; col < cols; col++) {
      if (grid[row][col]) {
        if (foundGap) {
          // Found occupied after gap - this is a horizontal gap
          return true;
        }
        foundOccupied = true;
      } else if (foundOccupied) {
        foundGap = true;
      }
    }
  }

  return false;
}

/**
 * Normalize layout to ensure no overlaps
 * Shifts panels down if they would overlap
 *
 * @param layout - Layout to normalize
 * @param cols - Number of columns
 * @returns Normalized layout without overlaps
 */
export function normalizeLayout(
  layout: LayoutItem[],
  cols: number = 12
): LayoutItem[] {
  if (layout.length === 0) return layout;

  // Clone and sort by y, then x
  const newLayout = layout.map((item) => ({ ...item }));
  newLayout.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  const grid = createOccupancyGrid([], cols, 100); // Start with empty grid

  // Place each item, shifting down if needed
  for (let i = 0; i < newLayout.length; i++) {
    const item = newLayout[i];
    let y = item.y;

    // Find lowest y where item fits
    while (!canPlace(grid, item.x, y, item.w, item.h, cols)) {
      y++;
    }

    // Update item position
    newLayout[i] = { ...item, y };

    // Mark cells as occupied
    for (let row = y; row < y + item.h; row++) {
      for (let col = item.x; col < item.x + item.w && col < cols; col++) {
        if (row < grid.length) {
          grid[row][col] = true;
        }
      }
    }
  }

  return newLayout;
}

/**
 * Check if an item can be placed at position without overlap
 */
function canPlace(
  grid: OccupancyGrid,
  x: number,
  y: number,
  w: number,
  h: number,
  cols: number
): boolean {
  // Check bounds
  if (x + w > cols) return false;

  // Check each cell
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      if (row < grid.length && grid[row][col]) {
        return false; // Cell occupied
      }
    }
  }

  return true;
}

// =============================================
// Grid Height Calculation
// =============================================

/**
 * Calculate the fixed grid height based on panel layout
 * This constrains the grid to prevent unlimited vertical expansion
 *
 * @param layout - Current layout items
 * @param rowHeight - Height of each grid row in pixels
 * @param margin - Margin between panels [x, y]
 * @returns Grid height in pixels
 */
export function calculateGridHeight(
  layout: LayoutItem[],
  rowHeight: number,
  margin: [number, number]
): number {
  if (layout.length === 0) return rowHeight; // Minimum 1 row height

  // Find the maximum bottom edge (y + h) across all panels
  const maxBottom = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);

  // Calculate pixel height: rows × rowHeight + (rows - 1) × marginY
  // Formula: totalHeight = maxBottom * rowHeight + (maxBottom - 1) * margin[1]
  const marginTotal = maxBottom > 0 ? (maxBottom - 1) * margin[1] : 0;
  return maxBottom * rowHeight + marginTotal;
}

// =============================================
// Overlap-Based Panel Swap (New Algorithm)
// =============================================
// With allowOverlap=true, RGL doesn't push panels during drag.
// When panels overlap after drag, we resolve by swapping positions.

/**
 * Check if two layout items overlap in position
 * Used to detect if one panel moved into another's space
 */
function itemsOverlap(a: LayoutItem, b: LayoutItem): boolean {
  console.log('[itemsOverlap] 🔍 Checking overlap between panels');
  console.log('[itemsOverlap] Panel A:', { i: a.i, x: a.x, y: a.y, w: a.w, h: a.h, right: a.x + a.w, bottom: a.y + a.h });
  console.log('[itemsOverlap] Panel B:', { i: b.i, x: b.x, y: b.y, w: b.w, h: b.h, right: b.x + b.w, bottom: b.y + b.h });

  // Check if rectangles overlap
  const aLeftOfB = a.x + a.w <= b.x;
  const bLeftOfA = b.x + b.w <= a.x;
  const aAboveB = a.y + a.h <= b.y;
  const bAboveA = b.y + b.h <= a.y;

  console.log('[itemsOverlap] Separation checks: aLeftOfB =', aLeftOfB, ', bLeftOfA =', bLeftOfA, ', aAboveB =', aAboveB, ', bAboveA =', bAboveA);

  const isOverlapping = !(aLeftOfB || bLeftOfA || aAboveB || bAboveA);
  console.log('[itemsOverlap] Result: isOverlapping =', isOverlapping, isOverlapping ? '✅ OVERLAP DETECTED' : '❌ No overlap');

  return isOverlapping;
}

/**
 * Resolve overlaps by swapping panel positions
 *
 * This function is designed for allowOverlap=true mode where:
 * - RGL doesn't push panels during drag
 * - The dragged panel may overlap other panels after drag
 * - We need to move overlapped panels to the dragged panel's old position
 *
 * Algorithm:
 * 1. Find the dragged panel in both old and new layouts
 * 2. Find all panels that now overlap with the dragged panel
 * 3. Move overlapped panels to the dragged panel's old position
 * 4. Exchange sizes between dragged and overlapped panels
 *
 * @param draggedPanelId - ID of the panel that was dragged
 * @param oldLayout - Layout before drag (snapshot)
 * @param newLayout - Layout after drag (from RGL)
 * @returns Layout with overlaps resolved by swapping
 */
export function resolveOverlapSwap(
  draggedPanelId: string,
  oldLayout: LayoutItem[],
  newLayout: LayoutItem[]
): LayoutItem[] {
  console.log('');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║ [resolveOverlapSwap] 🔄 STARTING OVERLAP RESOLUTION       ║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('[resolveOverlapSwap] draggedPanelId:', draggedPanelId);
  console.log('[resolveOverlapSwap] oldLayout (BEFORE drag):', oldLayout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));
  console.log('[resolveOverlapSwap] newLayout (AFTER drag):', newLayout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));

  // Clone layout to avoid mutation
  const resultLayout = newLayout.map(item => ({ ...item }));
  console.log('[resolveOverlapSwap] Step 1: Cloned newLayout to resultLayout (to avoid mutation)');

  // Find dragged panel in both layouts
  const draggedOld = oldLayout.find(item => item.i === draggedPanelId);
  const draggedNewIndex = resultLayout.findIndex(item => item.i === draggedPanelId);
  const draggedNew = draggedNewIndex >= 0 ? resultLayout[draggedNewIndex] : null;

  console.log('[resolveOverlapSwap] Step 2: Finding dragged panel in both layouts');
  console.log('[resolveOverlapSwap] draggedOld (from oldLayout):', draggedOld ? { i: draggedOld.i, x: draggedOld.x, y: draggedOld.y, w: draggedOld.w, h: draggedOld.h } : 'NOT FOUND');
  console.log('[resolveOverlapSwap] draggedNewIndex:', draggedNewIndex);
  console.log('[resolveOverlapSwap] draggedNew (from newLayout):', draggedNew ? { i: draggedNew.i, x: draggedNew.x, y: draggedNew.y, w: draggedNew.w, h: draggedNew.h } : 'NOT FOUND');

  // If we can't find the dragged panel, return as-is
  if (!draggedOld || !draggedNew) {
    console.log('[resolveOverlapSwap] ⚠️ EARLY EXIT: Could not find dragged panel in one of the layouts');
    return resultLayout;
  }

  // Check if the dragged panel actually moved
  const hasMoved = draggedOld.x !== draggedNew.x || draggedOld.y !== draggedNew.y;
  console.log('[resolveOverlapSwap] Step 3: Checking if panel moved');
  console.log('[resolveOverlapSwap] Position change: old=(%d,%d) → new=(%d,%d)', draggedOld.x, draggedOld.y, draggedNew.x, draggedNew.y);
  console.log('[resolveOverlapSwap] hasMoved:', hasMoved);

  if (!hasMoved) {
    console.log('[resolveOverlapSwap] ⚠️ EARLY EXIT: Panel did not move, no swap needed');
    return resultLayout;
  }

  // Find all panels that overlap with the dragged panel's NEW position
  console.log('[resolveOverlapSwap] Step 4: Finding all overlapping panels');
  const overlappedPanels: Array<{ index: number; oldItem: LayoutItem; newItem: LayoutItem }> = [];

  for (let i = 0; i < resultLayout.length; i++) {
    const panel = resultLayout[i];

    // Skip the dragged panel itself
    if (panel.i === draggedPanelId) {
      console.log('[resolveOverlapSwap] Skipping panel "%s" (is the dragged panel)', panel.i);
      continue;
    }

    console.log('[resolveOverlapSwap] Checking if panel "%s" overlaps with dragged panel...', panel.i);
    // Check if this panel overlaps with dragged panel's new position
    if (itemsOverlap(draggedNew, panel)) {
      const oldItem = oldLayout.find(o => o.i === panel.i);
      if (oldItem) {
        overlappedPanels.push({ index: i, oldItem, newItem: panel });
        console.log('[resolveOverlapSwap] ✅ Panel "%s" OVERLAPS! Added to overlappedPanels', panel.i);
      }
    }
  }

  console.log('[resolveOverlapSwap] Step 5: Overlap detection complete');
  console.log('[resolveOverlapSwap] Total overlapped panels found:', overlappedPanels.length);
  console.log('[resolveOverlapSwap] Overlapped panels:', overlappedPanels.map(p => ({ i: p.newItem.i, index: p.index })));

  // If no overlaps, return as-is
  if (overlappedPanels.length === 0) {
    console.log('[resolveOverlapSwap] ⚠️ EARLY EXIT: No overlaps detected, returning layout as-is');
    return resultLayout;
  }

  // Store dragged panel's old position and size for the swap
  const draggedOldPos = { x: draggedOld.x, y: draggedOld.y };
  const draggedOldSize = { w: draggedOld.w, h: draggedOld.h };

  console.log('[resolveOverlapSwap] Step 6: Storing dragged panel OLD position/size for swap');
  console.log('[resolveOverlapSwap] draggedOldPos:', draggedOldPos);
  console.log('[resolveOverlapSwap] draggedOldSize:', draggedOldSize);

  // Calculate total height of overlapped panels (for multi-panel swap)
  const totalOverlappedHeight = overlappedPanels.reduce((sum, p) => sum + p.oldItem.h, 0);
  console.log('[resolveOverlapSwap] totalOverlappedHeight:', totalOverlappedHeight);

  // For single panel swap: exchange sizes completely
  if (overlappedPanels.length === 1) {
    console.log('[resolveOverlapSwap] Step 7a: SINGLE PANEL SWAP');
    const { index: overlappedIndex, oldItem: overlappedOld } = overlappedPanels[0];

    console.log('[resolveOverlapSwap] Overlapped panel details:');
    console.log('[resolveOverlapSwap]   - ID:', overlappedOld.i);
    console.log('[resolveOverlapSwap]   - Index in resultLayout:', overlappedIndex);
    console.log('[resolveOverlapSwap]   - OLD position/size:', { x: overlappedOld.x, y: overlappedOld.y, w: overlappedOld.w, h: overlappedOld.h });

    console.log('[resolveOverlapSwap] 🔄 SWAPPING POSITIONS AND SIZES:');

    // Move overlapped panel to dragged panel's old position with dragged panel's old size
    console.log('[resolveOverlapSwap] Moving overlapped panel "%s" to dragged panel OLD position:', overlappedOld.i);
    console.log('[resolveOverlapSwap]   BEFORE: x=%d, y=%d, w=%d, h=%d', resultLayout[overlappedIndex].x, resultLayout[overlappedIndex].y, resultLayout[overlappedIndex].w, resultLayout[overlappedIndex].h);

    resultLayout[overlappedIndex].x = draggedOldPos.x;
    resultLayout[overlappedIndex].y = draggedOldPos.y;
    resultLayout[overlappedIndex].w = draggedOldSize.w;
    resultLayout[overlappedIndex].h = draggedOldSize.h;

    console.log('[resolveOverlapSwap]   AFTER:  x=%d, y=%d, w=%d, h=%d', resultLayout[overlappedIndex].x, resultLayout[overlappedIndex].y, resultLayout[overlappedIndex].w, resultLayout[overlappedIndex].h);

    // Update dragged panel to take overlapped panel's old size
    console.log('[resolveOverlapSwap] Updating dragged panel "%s" to take overlapped panel OLD size:', draggedPanelId);
    console.log('[resolveOverlapSwap]   BEFORE: w=%d, h=%d', resultLayout[draggedNewIndex].w, resultLayout[draggedNewIndex].h);

    resultLayout[draggedNewIndex].w = overlappedOld.w;
    resultLayout[draggedNewIndex].h = overlappedOld.h;

    console.log('[resolveOverlapSwap]   AFTER:  w=%d, h=%d', resultLayout[draggedNewIndex].w, resultLayout[draggedNewIndex].h);
  } else {
    // Multi-panel swap: stack overlapped panels at dragged panel's old position
    console.log('[resolveOverlapSwap] Step 7b: MULTI-PANEL SWAP (stacking %d panels)', overlappedPanels.length);
    let currentY = draggedOldPos.y;

    for (const { index } of overlappedPanels) {
      console.log('[resolveOverlapSwap] Moving panel "%s" to x=%d, y=%d, w=%d (keeping original height)', resultLayout[index].i, draggedOldPos.x, currentY, draggedOldSize.w);

      resultLayout[index].x = draggedOldPos.x;
      resultLayout[index].y = currentY;
      resultLayout[index].w = draggedOldSize.w;
      // Keep original heights for multi-panel case
      currentY += resultLayout[index].h;

      console.log('[resolveOverlapSwap] Next panel will start at y=%d', currentY);
    }

    console.log('[resolveOverlapSwap] Dragged panel keeps its new size in multi-panel case');
  }

  console.log('[resolveOverlapSwap] Step 8: FINAL RESULT');
  console.log('[resolveOverlapSwap] resultLayout:', resultLayout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║ [resolveOverlapSwap] ✅ OVERLAP RESOLUTION COMPLETE        ║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('');

  return resultLayout;
}

// =============================================
// Legacy Panel Swap Detection (Deprecated)
// =============================================
// This algorithm was designed for push-based collision (preventCollision=false).
// It doesn't work with allowOverlap=true because only the dragged panel moves.
// Use resolveOverlapSwap() instead for overlap-based swap detection.

/**
 * Check if a panel has significantly moved to a new position
 * Returns true if the panel center has moved across columns
 * @deprecated Use resolveOverlapSwap instead
 */
function hasPanelMoved(oldItem: LayoutItem, newItem: LayoutItem): boolean {
  // Check if position changed significantly (different column or row)
  const xChanged = Math.abs(oldItem.x - newItem.x) >= 1;
  const yChanged = Math.abs(oldItem.y - newItem.y) >= 1;
  return xChanged || yChanged;
}

/**
 * Detect if panels swapped positions and exchange their sizes
 * @deprecated This function doesn't work with allowOverlap=true mode.
 * Use resolveOverlapSwap() instead which handles overlap-based swapping.
 *
 * Algorithm:
 * 1. Find panels that changed position from old to new layout
 * 2. For each moved panel A, check if another panel B now occupies A's old position
 * 3. If both panels swapped positions, exchange their sizes (w, h)
 *
 * @param oldLayout - Layout before drag operation
 * @param newLayout - Layout after drag operation (from react-grid-layout)
 * @returns SwapResult with layout containing exchanged sizes if swap detected
 */
export function detectAndSwapPanels(
  oldLayout: LayoutItem[],
  newLayout: LayoutItem[]
): SwapResult {
  // Early exit if layouts are empty or have different lengths
  if (oldLayout.length === 0 || newLayout.length !== oldLayout.length) {
    return { layout: newLayout, swapped: false };
  }

  // Clone new layout to avoid mutation
  const resultLayout = newLayout.map(item => ({ ...item }));

  // Find panels that moved significantly
  const movedPanels: Array<{ id: string; oldItem: LayoutItem; newItem: LayoutItem }> = [];

  for (const newItem of newLayout) {
    const oldItem = oldLayout.find(o => o.i === newItem.i);
    if (oldItem && hasPanelMoved(oldItem, newItem)) {
      movedPanels.push({ id: newItem.i, oldItem, newItem });
    }
  }

  // Need at least 2 moved panels for a swap
  if (movedPanels.length < 2) {
    return { layout: newLayout, swapped: false };
  }

  // Check for pairwise swaps: Panel A moved to B's old position AND B moved to A's old position
  for (let i = 0; i < movedPanels.length; i++) {
    for (let j = i + 1; j < movedPanels.length; j++) {
      const panelA = movedPanels[i];
      const panelB = movedPanels[j];

      // Check if A is now in B's old area (overlap check)
      const aInBOldArea = itemsOverlap(panelA.newItem, panelB.oldItem);
      // Check if B is now in A's old area (overlap check)
      const bInAOldArea = itemsOverlap(panelB.newItem, panelA.oldItem);

      // If both conditions are true, this is a swap
      if (aInBOldArea && bInAOldArea) {
        // Find the items in result layout and exchange sizes
        const resultA = resultLayout.find(r => r.i === panelA.id);
        const resultB = resultLayout.find(r => r.i === panelB.id);

        if (resultA && resultB) {
          // Store original sizes from OLD layout (before any changes)
          const oldSizeA = { w: panelA.oldItem.w, h: panelA.oldItem.h };
          const oldSizeB = { w: panelB.oldItem.w, h: panelB.oldItem.h };

          // Exchange sizes: A gets B's old size, B gets A's old size
          resultA.w = oldSizeB.w;
          resultA.h = oldSizeB.h;
          resultB.w = oldSizeA.w;
          resultB.h = oldSizeA.h;

          // Respect min/max constraints
          if (panelB.oldItem.minW) resultA.minW = panelB.oldItem.minW;
          if (panelB.oldItem.minH) resultA.minH = panelB.oldItem.minH;
          if (panelB.oldItem.maxW) resultA.maxW = panelB.oldItem.maxW;
          if (panelB.oldItem.maxH) resultA.maxH = panelB.oldItem.maxH;

          if (panelA.oldItem.minW) resultB.minW = panelA.oldItem.minW;
          if (panelA.oldItem.minH) resultB.minH = panelA.oldItem.minH;
          if (panelA.oldItem.maxW) resultB.maxW = panelA.oldItem.maxW;
          if (panelA.oldItem.maxH) resultB.maxH = panelA.oldItem.maxH;

          return {
            layout: resultLayout,
            swapped: true,
            panelA: panelA.id,
            panelB: panelB.id,
          };
        }
      }
    }
  }

  // No swap detected
  return { layout: newLayout, swapped: false };
}

/**
 * Get the total height in grid units (rows) for a layout
 * Used to determine the fixed grid boundary
 *
 * @param layout - Current layout items
 * @returns Maximum row count (y + h of bottommost panel)
 */
export function getLayoutMaxRows(layout: LayoutItem[]): number {
  if (layout.length === 0) return 1;
  return layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
}
