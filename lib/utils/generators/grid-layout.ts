// =============================================
// Grid Layout Utilities
// =============================================
// Custom utilities for react-grid-layout with allowOverlap mode
// Features:
// - Fills horizontal gaps when panels are resized or removed
// - Overlap-based swap: resolves panel overlaps by swapping positions
// - Layout equality check to prevent unnecessary updates
//
// Key approach: With allowOverlap=true, RGL doesn't push panels.
// We detect overlaps after drag and resolve by swapping positions.

import type { LayoutItem } from "@/types/workboard";

// =============================================
// Layout Equality Check
// =============================================

/**
 * Check if two layouts are equal by comparing content (not references)
 * Used to prevent unnecessary state updates that cause infinite loops
 *
 * @param layoutA - First layout to compare
 * @param layoutB - Second layout to compare
 * @returns true if layouts have identical content
 */
export function areLayoutsEqual(
  layoutA: LayoutItem[],
  layoutB: LayoutItem[]
): boolean {
  // Different lengths = not equal
  if (layoutA.length !== layoutB.length) {
    return false;
  }

  // Compare each item by content
  for (const itemA of layoutA) {
    const itemB = layoutB.find(b => b.i === itemA.i);
    if (!itemB) {
      return false; // Item not found in layoutB
    }

    // Compare position and size
    if (
      itemA.x !== itemB.x ||
      itemA.y !== itemB.y ||
      itemA.w !== itemB.w ||
      itemA.h !== itemB.h
    ) {
      return false;
    }
  }

  return true;
}

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

    // Position swap
    resultLayout[draggedNewIndex].x = overlappedOld.x;  // NEW
    resultLayout[draggedNewIndex].y = overlappedOld.y;  // NEW
    // Size swap
    resultLayout[draggedNewIndex].w = overlappedOld.w;
    resultLayout[draggedNewIndex].h = overlappedOld.h;

    console.log('[resolveOverlapSwap]   AFTER:  x=%d, y=%d, w=%d, h=%d',
      resultLayout[draggedNewIndex].x, resultLayout[draggedNewIndex].y,
      resultLayout[draggedNewIndex].w, resultLayout[draggedNewIndex].h);
  } else {
    // Multi-panel swap: stack overlapped panels at dragged panel's old position
    console.log('[resolveOverlapSwap] Step 7b: MULTI-PANEL SWAP (stacking %d panels)', overlappedPanels.length);

    // Sort overlapped panels by Y position (top-first) to maintain correct stacking order
    overlappedPanels.sort((a, b) => a.oldItem.y - b.oldItem.y);
    console.log('[resolveOverlapSwap] Sorted panels by Y (top-first):', overlappedPanels.map(p => ({ i: p.oldItem.i, y: p.oldItem.y })));

    // Get top panel's old position (where dragged panel will go)
    const topOverlappedPanel = overlappedPanels[0].oldItem;
    const topPanelOldPos = { x: topOverlappedPanel.x, y: topOverlappedPanel.y };
    console.log('[resolveOverlapSwap] Top panel old position:', topPanelOldPos);

    // Stack overlapped panels at dragged panel's old position
    let currentY = draggedOldPos.y;
    for (const { index } of overlappedPanels) {
      console.log('[resolveOverlapSwap] Moving panel "%s" to x=%d, y=%d, w=%d', resultLayout[index].i, draggedOldPos.x, currentY, draggedOldSize.w);
      resultLayout[index].x = draggedOldPos.x;  // Move to dragged's old X
      resultLayout[index].y = currentY;          // Stack vertically
      resultLayout[index].w = draggedOldSize.w;  // Take dragged's old width
      currentY += resultLayout[index].h;         // Next panel starts below
      console.log('[resolveOverlapSwap] Next panel will start at y=%d', currentY);
    }

    // Move dragged panel to top overlapped panel's old position
    console.log('[resolveOverlapSwap] Moving dragged panel to top panel old position');
    resultLayout[draggedNewIndex].x = topPanelOldPos.x;  // Top panel's old X
    resultLayout[draggedNewIndex].y = topPanelOldPos.y;  // Top panel's old Y
    resultLayout[draggedNewIndex].w = topOverlappedPanel.w;  // Top panel's old width
    resultLayout[draggedNewIndex].h = totalOverlappedHeight; // Combined height of all overlapped
    console.log('[resolveOverlapSwap] Dragged panel new pos/size: x=%d, y=%d, w=%d, h=%d',
      resultLayout[draggedNewIndex].x, resultLayout[draggedNewIndex].y,
      resultLayout[draggedNewIndex].w, resultLayout[draggedNewIndex].h);

    // Height equalization: if dragged panel was taller than combined overlapped panels
    const heightDiff = draggedOldSize.h - totalOverlappedHeight;
    if (heightDiff > 0) {
      console.log('[resolveOverlapSwap] Height mismatch detected: diff=%d, distributing evenly', heightDiff);
      // Calculate how much to add to each panel
      const baseGap = Math.floor(heightDiff / overlappedPanels.length);  // Base amount per panel
      const remainder = heightDiff % overlappedPanels.length;            // Extra units to distribute

      // Recalculate positions with expanded heights
      let adjustedY = draggedOldPos.y;
      for (let i = 0; i < overlappedPanels.length; i++) {
        const { index } = overlappedPanels[i];
        resultLayout[index].y = adjustedY;  // Update Y position
        // Add extra height: base + 1 extra for last 'remainder' panels
        const extraHeight = i >= (overlappedPanels.length - remainder) ? 1 : 0;
        resultLayout[index].h += baseGap + extraHeight;
        adjustedY += resultLayout[index].h;  // Next panel starts after this one
        console.log('[resolveOverlapSwap] Panel "%s" expanded: h=%d, nextY=%d', resultLayout[index].i, resultLayout[index].h, adjustedY);
      }
    }
  }

  console.log('[resolveOverlapSwap] Step 8: FINAL RESULT');
  console.log('[resolveOverlapSwap] resultLayout:', resultLayout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║ [resolveOverlapSwap] ✅ OVERLAP RESOLUTION COMPLETE        ║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('');

  return resultLayout;
}

