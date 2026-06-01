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
// Change Type Detection
// =============================================

export type ChangeType = 'drag' | 'resize' | 'added' | 'none';

export interface ChangeDetectionResult {
  changedId: string | null;
  changeType: ChangeType;
}

/**
 * Detect what type of change occurred between two layouts
 * Position change = DRAG, Size change = RESIZE
 * Position takes priority if both changed
 */
export function detectChangeType(
  oldLayout: LayoutItem[],
  newLayout: LayoutItem[]
): ChangeDetectionResult {
  for (const newItem of newLayout) {
    const oldItem = oldLayout.find(item => item.i === newItem.i);

    // Detect panels added to layout (exist in new but not old)
    if (!oldItem) {
      return { changedId: newItem.i, changeType: 'added' };
    }

    const positionChanged = oldItem.x !== newItem.x || oldItem.y !== newItem.y;
    const sizeChanged = oldItem.w !== newItem.w || oldItem.h !== newItem.h;

    if (positionChanged) {
      return { changedId: newItem.i, changeType: 'drag' };
    }
    if (sizeChanged) {
      return { changedId: newItem.i, changeType: 'resize' };
    }
  }

  return { changedId: null, changeType: 'none' };
}

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

/**
 * Count empty columns to the left of a panel
 * Checks all rows that the panel occupies
 */
function countEmptyColumnsToLeft(
  grid: OccupancyGrid,
  item: LayoutItem
): number {
  const leftEdge = item.x;
  if (leftEdge <= 0) return 0;

  let emptyCount = 0;
  for (let col = leftEdge - 1; col >= 0; col--) {
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

/**
 * Count empty rows above a panel
 * Checks all columns that the panel occupies
 */
function countEmptyRowsAbove(
  grid: OccupancyGrid,
  item: LayoutItem
): number {
  const topEdge = item.y; // Row at panel's top edge
  if (topEdge <= 0) return 0; // Already at grid top

  let emptyCount = 0;
  // Check rows above the panel, moving upward
  for (let row = topEdge - 1; row >= 0; row--) {
    let rowEmpty = true;
    // Check all columns that this panel spans
    for (let col = item.x; col < item.x + item.w; col++) {
      if (grid[row][col]) {
        rowEmpty = false;
        break;
      }
    }
    if (rowEmpty) {
      emptyCount++;
    } else {
      break; // Stop at first occupied row
    }
  }
  return emptyCount;
}

/**
 * Count empty rows below a panel
 * Checks all columns that the panel occupies
 * @param grid - Occupancy grid to check
 * @param item - Panel to check below
 * @param maxY - Optional maximum Y boundary (contextual bottom edge)
 */
function countEmptyRowsBelow(
  grid: OccupancyGrid,
  item: LayoutItem,
  maxY?: number // Optional bound for contextual vertical filling
): number {
  const bottomEdge = item.y + item.h; // Row after panel's bottom edge
  // Use maxY if provided, otherwise use grid.length as the boundary
  const scanLimit = maxY !== undefined ? Math.min(maxY, grid.length) : grid.length;
  if (bottomEdge >= scanLimit) return 0; // Already at boundary

  let emptyCount = 0;
  // Check rows below the panel, moving downward up to scanLimit
  for (let row = bottomEdge; row < scanLimit; row++) {
    let rowEmpty = true;
    // Check all columns that this panel spans
    for (let col = item.x; col < item.x + item.w; col++) {
      if (grid[row][col]) {
        rowEmpty = false;
        break;
      }
    }
    if (rowEmpty) {
      emptyCount++;
    } else {
      break; // Stop at first occupied row
    }
  }
  return emptyCount;
}

/**
 * Get the contextual bottom edge for a panel based on horizontally overlapping neighbors
 * This ensures vertical filling is bounded by the local layout area, not the global grid
 *
 * @param layout - Full layout array (excluding current panel)
 * @param item - The panel to find contextual bottom for
 * @returns The Y position that serves as the bottom boundary for vertical expansion
 */
function getContextualBottomEdge(
  layout: LayoutItem[],
  item: LayoutItem
): number {
  // Find all panels that horizontally overlap with the current panel
  const overlappingPanels = layout.filter((panel) => {
    if (panel.i === item.i) return false;
    const noOverlap = panel.x + panel.w <= item.x || panel.x >= item.x + item.w;
    return !noOverlap;
  });

  // Calculate global max bottom (fallback boundary)
  const globalMaxBottom = layout.reduce((max, p) => Math.max(max, p.y + p.h), 0);

  // If no horizontally overlapping panels, use global max
  if (overlappingPanels.length === 0) {
    return Math.max(globalMaxBottom, item.y + item.h);
  }

  // Filter to only panels that could block DOWNWARD expansion
  // (panels whose bottom extends BELOW current panel's bottom)
  const panelsBelowCurrentBottom = overlappingPanels.filter(panel =>
    panel.y + panel.h > item.y + item.h
  );

  // If no panels extend below current panel, use global max
  // (panels ABOVE don't limit downward expansion)
  if (panelsBelowCurrentBottom.length === 0) {
    return Math.max(globalMaxBottom, item.y + item.h);
  }

  // Use max bottom of panels that extend below current panel
  const contextualBottom = panelsBelowCurrentBottom.reduce((maxBottom, panel) => {
    return Math.max(maxBottom, panel.y + panel.h);
  }, 0);

  return Math.max(contextualBottom, item.y + item.h);
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
  cols: number = 12,
  excludeId?: string  // Panel ID to skip during expansion (e.g., the resized panel)
): LayoutItem[] {
  if (layout.length === 0) return layout;

  // Clone layout to avoid mutation
  const newLayout = layout.map((item) => ({ ...item }));

  // Sort by position: top-to-bottom, then left-to-right
  newLayout.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  // Process each panel for horizontal gap filling
  for (let i = 0; i < newLayout.length; i++) {
    const item = newLayout[i];

    // Skip excluded panel - prevents resized panel from re-expanding
    if (excludeId && item.i === excludeId) continue;

    // Rebuild occupancy grid excluding current item
    const otherItems = newLayout.filter((_, idx) => idx !== i);
    const grid = createOccupancyGrid(otherItems, cols);

    // Check for empty space to the LEFT (bidirectional expansion)
    const emptyLeft = countEmptyColumnsToLeft(grid, item);

    // Check for empty space to the RIGHT
    const emptyRight = countEmptyColumnsToRight(grid, item, cols);

    // Calculate new position and width
    const maxWidth = item.maxW ?? cols;
    const newX = item.x - emptyLeft;        // Shift left to fill gap
    let newW = item.w + emptyLeft + emptyRight;  // Expand both directions
    newW = Math.min(newW, maxWidth);      // Respect maxW

    // Update item if changed
    if (newX !== item.x || newW !== item.w) {
      newLayout[i] = { ...item, x: newX, w: newW };
    }
  }

  return newLayout;
}

/**
 * Compact layout and fill vertical gaps
 * Expands panels vertically to fill empty space above and below
 *
 * Algorithm:
 * 1. Sort panels by position (left-to-right, then top-to-bottom)
 * 2. For each panel, check for empty space above and below
 * 3. Expand height to fill the gap (respecting maxH if set)
 * 4. Rebuild occupancy grid after each expansion
 *
 * @param layout - Current layout items
 * @param cols - Number of grid columns (for occupancy grid creation)
 * @param excludeId - Panel ID to skip during expansion (e.g., the resized panel)
 * @returns New layout with vertical gaps filled
 */
export function compactAndFillVertical(
  layout: LayoutItem[],
  cols: number = 12,
  excludeId?: string
): LayoutItem[] {
  if (layout.length === 0) return layout;

  // Clone layout to avoid mutation
  const newLayout = layout.map((item) => ({ ...item }));

  // Sort by position: left-to-right, then top-to-bottom
  newLayout.sort((a, b) => {
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });

  // Process each panel for vertical gap filling
  for (let i = 0; i < newLayout.length; i++) {
    const item = newLayout[i];

    // Skip excluded panel - prevents resized panel from re-expanding
    if (excludeId && item.i === excludeId) continue;

    // Rebuild occupancy grid excluding current item
    const otherItems = newLayout.filter((_, idx) => idx !== i);
    const grid = createOccupancyGrid(otherItems, cols);

    // Get contextual bottom edge based on horizontally overlapping neighbors
    // This bounds vertical expansion to the local layout area, not global grid
    const contextualBottom = getContextualBottomEdge(otherItems, item);

    // Check for empty space ABOVE (bidirectional expansion)
    const emptyAbove = countEmptyRowsAbove(grid, item);

    // Check for empty space BELOW, bounded by contextual bottom edge
    const emptyBelow = countEmptyRowsBelow(grid, item, contextualBottom);

    // Calculate new position and height
    const maxHeight = item.maxH ?? Infinity; // No default max height limit
    const newY = item.y - emptyAbove;           // Shift up to fill gap
    let newH = item.h + emptyAbove + emptyBelow; // Expand both directions
    newH = Math.min(newH, maxHeight);         // Respect maxH if set

    // Update item if changed
    if (newY !== item.y || newH !== item.h) {
      newLayout[i] = { ...item, y: newY, h: newH };
    }
  }

  return newLayout;
}

/**
 * Compact layout and fill all gaps (both horizontal and vertical)
 * Combines horizontal and vertical gap filling for complete space utilization
 *
 * Algorithm:
 * 1. First fill horizontal gaps (left/right expansion)
 * 2. Then fill vertical gaps (up/down expansion)
 * 3. Returns fully compacted layout
 *
 * @param layout - Current layout items
 * @param cols - Number of grid columns (default: 12)
 * @param excludeId - Panel ID to skip during expansion (optional)
 * @returns New layout with all gaps filled
 */
export function compactAndFillAll(
  layout: LayoutItem[],
  cols: number = 12,
  excludeId?: string
): LayoutItem[] {
  // First fill horizontal gaps
  let result = compactAndFill(layout, cols, excludeId);

  // Then fill vertical gaps
  result = compactAndFillVertical(result, cols, excludeId);

  return result;
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
export function itemsOverlap(a: LayoutItem, b: LayoutItem): boolean {
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
 * Find all overlapping panel pairs in a layout
 * Returns array of [panelId1, panelId2] tuples for each overlap
 *
 * @param layout - Layout to check for overlaps
 * @returns Array of overlapping panel ID pairs
 */
export function findAllOverlaps(layout: LayoutItem[]): Array<[string, string]> {
  const overlaps: Array<[string, string]> = [];
  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) {
      if (itemsOverlap(layout[i], layout[j])) {
        overlaps.push([layout[i].i, layout[j].i]);
      }
    }
  }
  console.log('[findAllOverlaps] Found %d overlaps:', overlaps.length, overlaps);
  return overlaps;
}

/**
 * Equalize heights of overlapped panels to match target height
 * Handles both expansion (when target > combined) and shrinking (when target < combined)
 *
 * @param resultLayout - The layout array to modify (mutates in place)
 * @param overlappedPanels - Array of panels to adjust with their indices
 * @param targetHeight - The height that combined panels should match (dragged panel's old height)
 * @param totalOverlappedHeight - Current combined height of overlapped panels
 * @param startY - Y position where the stacked panels start
 */
function equalizeHeights(
  resultLayout: LayoutItem[],
  overlappedPanels: Array<{ index: number; oldItem: LayoutItem; newItem: LayoutItem }>,
  targetHeight: number,
  totalOverlappedHeight: number,
  startY: number
): void {
  // Calculate height difference: positive = expand, negative = shrink
  const heightDiff = targetHeight - totalOverlappedHeight;

  // No adjustment needed if heights match
  if (heightDiff === 0) {
    console.log('[equalizeHeights] Heights match, no adjustment needed');
    return;
  }

  const absHeightDiff = Math.abs(heightDiff);  // Absolute difference for calculation
  const panelCount = overlappedPanels.length;  // Number of panels to adjust
  const baseAdjust = Math.floor(absHeightDiff / panelCount);  // Base amount per panel
  const remainder = absHeightDiff % panelCount;  // Extra units to distribute

  if (heightDiff > 0) {
    // EXPAND: dragged panel was taller than combined overlapped panels
    console.log('[equalizeHeights] Expanding panels: diff=%d, baseAdjust=%d, remainder=%d', heightDiff, baseAdjust, remainder);

    let adjustedY = startY;
    for (let i = 0; i < panelCount; i++) {
      const { index } = overlappedPanels[i];
      resultLayout[index].y = adjustedY;  // Update Y position
      // Add extra height: base + 1 extra for last 'remainder' panels
      const extraHeight = i >= (panelCount - remainder) ? 1 : 0;
      resultLayout[index].h += baseAdjust + extraHeight;  // Expand height
      adjustedY += resultLayout[index].h;  // Next panel starts after this one
      console.log('[equalizeHeights] Panel "%s" expanded: h=%d, nextY=%d', resultLayout[index].i, resultLayout[index].h, adjustedY);
    }
  } else {
    // SHRINK: overlapped panels combined are taller than dragged panel was
    console.log('[equalizeHeights] Shrinking panels: diff=%d, baseAdjust=%d, remainder=%d', heightDiff, baseAdjust, remainder);

    let adjustedY = startY;
    for (let i = 0; i < panelCount; i++) {
      const { index } = overlappedPanels[i];
      resultLayout[index].y = adjustedY;  // Update Y position
      // Subtract height: base + 1 extra for last 'remainder' panels
      const extraShrink = i >= (panelCount - remainder) ? 1 : 0;
      resultLayout[index].h -= baseAdjust + extraShrink;  // Shrink height
      // Ensure minimum height of 1 to prevent zero/negative heights
      if (resultLayout[index].h < 1) resultLayout[index].h = 1;
      adjustedY += resultLayout[index].h;  // Next panel starts after this one
      console.log('[equalizeHeights] Panel "%s" shrunk: h=%d, nextY=%d', resultLayout[index].i, resultLayout[index].h, adjustedY);
    }
  }
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

  // NEW: Check if dragged panel's OLD position equals any overlapped panel's position
  // This happens when a new panel spawns at same location (e.g., toggle workflow on)
  // In this case, swap would have no effect, so fallback to push
  const checkSamePositionOverlap = (): boolean => {
    for (let i = 0; i < resultLayout.length; i++) {
      const panel = resultLayout[i];
      if (panel.i === draggedPanelId) continue;

      // Check if this panel overlaps with dragged panel
      if (itemsOverlap(draggedNew, panel)) {
        // Check if dragged panel's OLD position is same as this panel's position
        if (panel.x === draggedOld.x && panel.y === draggedOld.y) {
          console.log('[resolveOverlapSwap] ⚠️ Same position detected: dragged OLD pos (%d,%d) == panel "%s" pos',
            draggedOld.x, draggedOld.y, panel.i);
          return true;
        }
      }
    }
    return false;
  };

  if (checkSamePositionOverlap()) {
    console.log('[resolveOverlapSwap] ⚠️ Falling back to PUSH resolution (same position swap would have no effect)');
    return resolveOverlapPush(draggedPanelId, resultLayout);
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

    // Equalize heights: adjust overlapped panels to match dragged panel's old height
    // Handles both expansion (dragged was taller) and shrinking (overlapped were taller)
    equalizeHeights(
      resultLayout,           // Layout to modify
      overlappedPanels,       // Panels to adjust
      draggedOldSize.h,       // Target height (dragged panel's old height)
      totalOverlappedHeight,  // Current combined height
      draggedOldPos.y         // Y position where stacked panels start
    );
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
// Overlap Push Resolution (for Resize operations)
// =============================================

/**
 * Resolve overlaps by pushing overlapped panels down
 * Used for RESIZE operations where swap doesn't make sense
 *
 * Algorithm (BFS-based):
 * 1. Find the resized panel
 * 2. Use queue to process panels breadth-first
 * 3. Push overlapped panels DOWN (newY = current.y + current.h)
 * 4. Track pushed panels to prevent infinite loops
 *
 * @param resizedPanelId - ID of the panel that was resized
 * @param newLayout - Layout after resize (from RGL)
 * @returns Layout with overlaps resolved by pushing
 */
export function resolveOverlapPush(
  resizedPanelId: string,
  newLayout: LayoutItem[]
): LayoutItem[] {
  console.log('');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║ [resolveOverlapPush] 📐 STARTING PUSH RESOLUTION          ║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('[resolveOverlapPush] resizedPanelId:', resizedPanelId);

  // Clone to avoid mutation
  const resultLayout = newLayout.map(item => ({ ...item }));

  // Find the resized panel
  const resizedPanel = resultLayout.find(item => item.i === resizedPanelId);
  if (!resizedPanel) {
    console.log('[resolveOverlapPush] ⚠️ Resized panel not found, returning as-is');
    return resultLayout;
  }

  // Track pushed panels to avoid infinite recursion
  const pushedPanels = new Set<string>([resizedPanelId]);

  // Process queue: panels that may cause overlaps
  const toProcess = [resizedPanelId];

  while (toProcess.length > 0) {
    const currentId = toProcess.shift()!;
    const currentPanel = resultLayout.find(item => item.i === currentId);
    if (!currentPanel) continue;

    console.log('[resolveOverlapPush] Processing panel:', currentId);

    // Find all panels overlapping with current panel
    for (let i = 0; i < resultLayout.length; i++) {
      const otherPanel = resultLayout[i];

      // Skip self and already pushed panels
      if (otherPanel.i === currentId) continue;
      if (pushedPanels.has(otherPanel.i)) continue;

      // Check overlap
      if (!itemsOverlap(currentPanel, otherPanel)) continue;

      console.log('[resolveOverlapPush] ✅ Panel "%s" overlaps, pushing down', otherPanel.i);

      // Calculate new Y position (push down below current panel)
      const newY = currentPanel.y + currentPanel.h;

      console.log('[resolveOverlapPush] Moving "%s": y=%d → y=%d', otherPanel.i, resultLayout[i].y, newY);

      // Apply push
      resultLayout[i] = {
        ...resultLayout[i],
        y: newY
      };

      // Mark as pushed and add to process queue for secondary overlaps
      pushedPanels.add(otherPanel.i);
      toProcess.push(otherPanel.i);
    }
  }

  console.log('[resolveOverlapPush] ✅ PUSH RESOLUTION COMPLETE');
  console.log('[resolveOverlapPush] Final layout:', resultLayout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));
  console.log('');

  return resultLayout;
}

// =============================================
// Pull Up Resolution (for H shrink operations)
// =============================================

/**
 * Pull panels up when a panel shrinks in height
 * Used after H shrink to fill the vertical gap
 *
 * Algorithm:
 * 1. Find the shrunk panel in both old and new layouts
 * 2. Calculate shrink amount (oldH - newH)
 * 3. Find panels that are BELOW the shrunk panel (horizontally overlapping)
 * 4. Pull them UP by the shrink amount (if they were adjacent)
 *
 * @param shrunkPanelId - ID of the panel that was shrunk
 * @param newLayout - Layout after shrink
 * @param oldLayout - Layout before shrink (to calculate shrink amount)
 * @returns Layout with panels pulled up to fill the gap
 */
export function resolveOverlapPull(
  shrunkPanelId: string,
  newLayout: LayoutItem[],
  oldLayout: LayoutItem[]
): LayoutItem[] {
  console.log('');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║ [resolveOverlapPull] ⬆️ STARTING PULL-UP RESOLUTION        ║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('[resolveOverlapPull] shrunkPanelId:', shrunkPanelId);

  const resultLayout = newLayout.map(item => ({ ...item }));

  const oldPanel = oldLayout.find(item => item.i === shrunkPanelId);
  const newPanel = resultLayout.find(item => item.i === shrunkPanelId);

  if (!oldPanel || !newPanel) {
    console.log('[resolveOverlapPull] ⚠️ Panel not found in one of the layouts');
    return resultLayout;
  }

  const shrinkAmount = oldPanel.h - newPanel.h;
  console.log('[resolveOverlapPull] Shrink amount: %d (oldH=%d, newH=%d)', shrinkAmount, oldPanel.h, newPanel.h);

  if (shrinkAmount <= 0) {
    console.log('[resolveOverlapPull] ⚠️ Panel did not shrink, returning as-is');
    return resultLayout;
  }

  const oldBottom = oldPanel.y + oldPanel.h;
  const newBottom = newPanel.y + newPanel.h;

  console.log('[resolveOverlapPull] oldBottom=%d, newBottom=%d', oldBottom, newBottom);

  // Find panels that were directly below (touching or within the shrunk area)
  for (let i = 0; i < resultLayout.length; i++) {
    const panel = resultLayout[i];
    if (panel.i === shrunkPanelId) continue;

    // Check if panel horizontally overlaps with shrunk panel (same columns)
    const horizontalOverlap = !(panel.x + panel.w <= newPanel.x || panel.x >= newPanel.x + newPanel.w);

    // Check if panel was below the shrunk panel's old bottom
    // and is currently below the new bottom
    const wasBelow = panel.y >= oldBottom - shrinkAmount; // Was in the shrunk zone or below
    const isBelowNewBottom = panel.y > newBottom;

    console.log('[resolveOverlapPull] Panel "%s": horizontalOverlap=%s, wasBelow=%s, isBelowNewBottom=%s',
      panel.i, horizontalOverlap, wasBelow, isBelowNewBottom);

    if (horizontalOverlap && wasBelow && isBelowNewBottom) {
      // Pull up by shrink amount, but don't go above the new bottom
      const newY = Math.max(newBottom, panel.y - shrinkAmount);
      console.log('[resolveOverlapPull] ⬆️ Pulling panel "%s" up: y=%d → y=%d', panel.i, panel.y, newY);
      resultLayout[i] = { ...panel, y: newY };
    }
  }

  console.log('[resolveOverlapPull] ✅ PULL-UP RESOLUTION COMPLETE');
  console.log('[resolveOverlapPull] Final layout:', resultLayout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));
  console.log('');

  return resultLayout;
}

// =============================================
// Push Right Resolution (for W extend operations)
// =============================================

/**
 * Push panels to the right when a panel extends in width
 * Similar to resolveOverlapPush but horizontal
 *
 * Algorithm (BFS-based):
 * 1. Find the extended panel
 * 2. Use queue to process panels breadth-first
 * 3. Push overlapped panels RIGHT (newX = current.x + current.w)
 * 4. Track pushed panels to prevent infinite loops
 *
 * @param extendedPanelId - ID of the panel that was extended
 * @param newLayout - Layout after extend
 * @param cols - Number of grid columns (default: 12)
 * @returns Layout with overlaps resolved by pushing right
 */
export function resolveOverlapPushRight(
  extendedPanelId: string,
  newLayout: LayoutItem[],
  cols: number = 12
): LayoutItem[] {
  console.log('');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║ [resolveOverlapPushRight] ➡️ STARTING PUSH-RIGHT RESOLUTION ║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('[resolveOverlapPushRight] extendedPanelId:', extendedPanelId);
  console.log('[resolveOverlapPushRight] cols:', cols);

  const resultLayout = newLayout.map(item => ({ ...item }));

  const extendedPanel = resultLayout.find(item => item.i === extendedPanelId);
  if (!extendedPanel) {
    console.log('[resolveOverlapPushRight] ⚠️ Extended panel not found');
    return resultLayout;
  }

  // Track pushed panels to avoid infinite recursion
  const pushedPanels = new Set<string>([extendedPanelId]);

  // Process queue: panels that may cause overlaps
  const toProcess = [extendedPanelId];

  while (toProcess.length > 0) {
    const currentId = toProcess.shift()!;
    const currentPanel = resultLayout.find(item => item.i === currentId);
    if (!currentPanel) continue;

    console.log('[resolveOverlapPushRight] Processing panel:', currentId);

    // Find all panels overlapping with current panel
    for (let i = 0; i < resultLayout.length; i++) {
      const otherPanel = resultLayout[i];

      // Skip self and already pushed panels
      if (otherPanel.i === currentId) continue;
      if (pushedPanels.has(otherPanel.i)) continue;

      // Check overlap
      if (!itemsOverlap(currentPanel, otherPanel)) continue;

      // Calculate new X position (push right to current panel's right edge)
      const newX = currentPanel.x + currentPanel.w;

      // Check if would go off grid
      if (newX + otherPanel.w > cols) {
        // Calculate available width after pushing right
        const availableWidth = cols - newX;
        const minWidth = otherPanel.minW ?? 1;

        // Can shrink to fit?
        if (availableWidth >= minWidth) {
          // Push right AND shrink width to fit within grid
          resultLayout[i] = {
            ...resultLayout[i],
            x: newX,
            w: availableWidth
          };
          pushedPanels.add(otherPanel.i);
          // Don't add to toProcess - already at grid edge, can't push further
          console.log('[resolveOverlapPushRight] ➡️ Panel "%s" shrunk to fit: x=%d, w=%d (was %d)',
            otherPanel.i, newX, availableWidth, otherPanel.w);
        } else {
          console.log('[resolveOverlapPushRight] ⚠️ Panel "%s" cannot fit (available=%d, minW=%d), skipping',
            otherPanel.i, availableWidth, minWidth);
        }
        continue;
      }

      console.log('[resolveOverlapPushRight] ➡️ Pushing panel "%s" right: x=%d → x=%d', otherPanel.i, otherPanel.x, newX);

      // Apply push
      resultLayout[i] = {
        ...resultLayout[i],
        x: newX
      };

      // Mark as pushed and add to process queue for secondary overlaps
      pushedPanels.add(otherPanel.i);
      toProcess.push(otherPanel.i);
    }
  }

  console.log('[resolveOverlapPushRight] ✅ PUSH-RIGHT RESOLUTION COMPLETE');
  console.log('[resolveOverlapPushRight] Final layout:', resultLayout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));
  console.log('');

  return resultLayout;
}

/**
 * Resolve overlaps by shrinking overlapping panels' width
 * Used when restoring hidden panels - shrinks expanded panels back
 *
 * Algorithm:
 * 1. Find the restored panel
 * 2. Find all panels that overlap with it
 * 3. For each overlapping panel, shrink width to avoid restored panel's X range
 *
 * @param restoredPanelId - ID of the panel being restored
 * @param newLayout - Layout with restored panel added
 * @param cols - Number of grid columns (default: 12)
 * @returns Layout with overlaps resolved by shrinking widths
 */
export function resolveOverlapShrinkWidth(
  restoredPanelId: string,
  newLayout: LayoutItem[],
  cols: number = 12
): LayoutItem[] {
  console.log('');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║ [resolveOverlapShrinkWidth] 📐 STARTING SHRINK RESOLUTION  ║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('[resolveOverlapShrinkWidth] restoredPanelId:', restoredPanelId);

  // Clone to avoid mutation
  const resultLayout = newLayout.map(item => ({ ...item }));

  // Find the restored panel
  const restoredPanel = resultLayout.find(item => item.i === restoredPanelId);
  if (!restoredPanel) {
    console.log('[resolveOverlapShrinkWidth] ⚠️ Restored panel not found, returning as-is');
    return resultLayout;
  }

  console.log('[resolveOverlapShrinkWidth] Restored panel:', {
    i: restoredPanel.i,
    x: restoredPanel.x,
    y: restoredPanel.y,
    w: restoredPanel.w,
    h: restoredPanel.h
  });

  // Track processed panels to avoid infinite loops
  const processedPanels = new Set<string>([restoredPanelId]);

  // Process queue: panels that may cause overlaps
  const toProcess = [restoredPanelId];

  while (toProcess.length > 0) {
    const currentId = toProcess.shift()!;
    const currentPanel = resultLayout.find(item => item.i === currentId);
    if (!currentPanel) continue;

    console.log('[resolveOverlapShrinkWidth] Processing panel:', currentId);

    // Find all panels overlapping with current panel
    for (let i = 0; i < resultLayout.length; i++) {
      const otherPanel = resultLayout[i];

      // Skip self and already processed panels
      if (otherPanel.i === currentId) continue;
      if (processedPanels.has(otherPanel.i)) continue;

      // Check overlap
      if (!itemsOverlap(currentPanel, otherPanel)) continue;

      console.log('[resolveOverlapShrinkWidth] ✅ Panel "%s" overlaps with current panel', otherPanel.i);
      console.log('[resolveOverlapShrinkWidth] Overlapping panel before:', {
        i: otherPanel.i,
        x: otherPanel.x,
        y: otherPanel.y,
        w: otherPanel.w,
        h: otherPanel.h
      });

      // Determine shrink direction based on relative position
      const currentLeft = currentPanel.x;
      const currentRight = currentPanel.x + currentPanel.w;
      const otherLeft = otherPanel.x;
      const otherRight = otherPanel.x + otherPanel.w;

      // --- X-axis resolution (skip when panels share the exact same column) ---
      const sameColumn = otherLeft === currentLeft && otherRight === currentRight;
      if (!sameColumn) {
        if (otherLeft < currentLeft && otherRight > currentLeft) {
          // Overlapping panel extends from left INTO current panel's space
          // Shrink its right edge to stop at current panel's left edge
          const newWidth = currentLeft - otherLeft;
          console.log('[resolveOverlapShrinkWidth] Shrinking right edge: w=%d → w=%d', otherPanel.w, newWidth);
          resultLayout[i] = {
            ...resultLayout[i],
            w: newWidth
          };
        } else if (otherLeft >= currentLeft && otherLeft < currentRight) {
          // Overlapping panel starts INSIDE current panel's space
          // Shift it right and shrink if needed
          const newX = currentRight;
          const availableWidth = cols - newX;
          const minW = otherPanel.minW ?? 1;
          if (availableWidth >= minW) {
            const newWidth = Math.min(otherPanel.w, availableWidth);
            console.log('[resolveOverlapShrinkWidth] Shifting right: x=%d → x=%d, w=%d → w=%d',
              otherPanel.x, newX, otherPanel.w, newWidth);
            resultLayout[i] = {
              ...resultLayout[i],
              x: newX,
              w: newWidth
            };
          } else {
            console.log('[resolveOverlapShrinkWidth] Skipping X-shift: availableWidth=%d < minW=%d, deferring to Y-axis',
              availableWidth, minW);
          }
        }
      }

      // Re-check overlap after X-axis resolution — skip Y-axis if already resolved
      if (!itemsOverlap(currentPanel, resultLayout[i])) {
        console.log('[resolveOverlapShrinkWidth] X-axis resolved overlap, skipping Y-axis for panel', resultLayout[i].i);
        // Mark as processed and add to queue for cascading resolution
        processedPanels.add(otherPanel.i);
        toProcess.push(otherPanel.i);
        continue;
      }

      // --- Y-axis resolution ---
      const currentTop = currentPanel.y;
      const currentBottom = currentPanel.y + currentPanel.h;
      const otherTop = resultLayout[i].y;
      const otherBottom = resultLayout[i].y + resultLayout[i].h;

      if (otherTop < currentTop && otherBottom > currentTop) {
        // Other panel is ABOVE current and its bottom extends into current space
        // Shrink its height to stop at current panel's top edge
        const newHeight = currentTop - otherTop;
        console.log('[resolveOverlapShrinkWidth] Shrinking height: h=%d → h=%d', resultLayout[i].h, newHeight);
        resultLayout[i] = {
          ...resultLayout[i],
          h: newHeight
        };
      } else if (otherTop >= currentTop && otherTop < currentBottom) {
        // Other panel starts INSIDE or BELOW current panel's space
        // Push it down below the current panel
        const newY = currentBottom;
        console.log('[resolveOverlapShrinkWidth] Pushing down: y=%d → y=%d', resultLayout[i].y, newY);
        resultLayout[i] = {
          ...resultLayout[i],
          y: newY
        };
      }

      console.log('[resolveOverlapShrinkWidth] Overlapping panel after:', {
        i: resultLayout[i].i,
        x: resultLayout[i].x,
        y: resultLayout[i].y,
        w: resultLayout[i].w,
        h: resultLayout[i].h
      });

      // Mark as processed and add to queue for cascading resolution
      processedPanels.add(otherPanel.i);
      toProcess.push(otherPanel.i);
    }
  }

  console.log('[resolveOverlapShrinkWidth] ✅ SHRINK RESOLUTION COMPLETE');
  console.log('[resolveOverlapShrinkWidth] Final layout:', resultLayout.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));
  console.log('');

  return resultLayout;
}

