// =============================================
// Grid Layout Utilities
// =============================================
// Custom auto-fill implementation for react-grid-layout
// Fills horizontal gaps when panels are resized or removed

import type { LayoutItem } from "@/types/workboard";

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
