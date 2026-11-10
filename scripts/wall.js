(function(){
  // Packs the wall's tiles into columns. Each tile goes into the shortest
  // column so far, so the wall reads roughly row by row, oldest first, and a
  // tile's top is never above an earlier tile's top. app.js relies on that
  // order for the month bar. Pure: it takes aspect ratios (height / width) and
  // the wall's width and returns positions.
  function pack(ratios, width) {
    const columns = width >= 1500 ? 6 : width >= 1150 ? 5 : width >= 820 ? 4 : width >= 500 ? 3 : 2;
    const gap = width >= 500 ? 6 : 4;
    const columnWidth = (width - gap * (columns - 1)) / columns;
    const heights = new Array(columns).fill(0);
    const positions = ratios.map(ratio => {
      let c = 0;
      for (let i = 1; i < columns; i++) if (heights[i] < heights[c]) c = i;
      const height = Math.round(columnWidth * ratio);
      const position = { x: c * (columnWidth + gap), y: heights[c], width: columnWidth, height };
      heights[c] += height + gap;
      return position;
    });
    return { columnWidth, positions, height: Math.max(0, Math.max(...heights) - gap) };
  }
  window.WallLayout = { pack };
})();
