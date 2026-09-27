/**
 * Query Lens — Core JavaScript
 * Preserves all SQL parsing, visualization, diagnostics, explanation, & optimization functionality.
 * Adds History (localStorage), Examples Library, and Proximity Micro-interactions.
 */

// Global state
let analysisHistory = [];

document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    initExamples();
    setupProximityInteractions();
});

/**
 * Utility: HTML Escaper
 */
function escapeXml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe || '';
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

/**
 * Instantiate SQL Parser across UMD builds
 */
function getParserInstance() {
    if (typeof NodeSQLParser !== 'undefined' && typeof NodeSQLParser.Parser === 'function') {
        return new NodeSQLParser.Parser();
    }
    if (typeof NodeSQLParser === 'function') {
        return new NodeSQLParser();
    }
    if (typeof NodeSQLParser !== 'undefined' && typeof NodeSQLParser.astify === 'function') {
        return NodeSQLParser;
    }
    if (typeof Parser === 'function') {
        return new Parser();
    }
    return null;
}

function showNotification(msg) {
    alert(msg);
}

function clearVisuals() {
    const canvas = document.getElementById('visualCanvasContainer');
    if (canvas) canvas.innerHTML = '<div class="text-center p-6 text-slate-400/60"><p class="text-sm">Unable to generate diagram for invalid query.</p></div>';
}

function scrollToSection(id) {
    const elem = document.getElementById(id);
    if (elem) {
        elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Main Processing Workflow
 */
function processQuery() {
    const inputElem = document.getElementById('sqlInput');
    if (!inputElem) return;

    const rawSql = inputElem.value.trim();
    if (!rawSql) {
        showNotification("Please enter a SQL query to inspect.");
        return;
    }

    // 1. Syntax Parsing via Node SQL Parser
    const syntaxResult = parseSQLSyntax(rawSql);

    if (syntaxResult.error) {
        renderDiagnostics([syntaxResult.error]);
        clearVisuals();
        renderNarrativeExplanation({}, rawSql, [syntaxResult.error]);
        renderOptimizations({}, rawSql, [syntaxResult.error]);
        saveToHistory(rawSql, 'error', 'Syntax error detected');
        return;
    }

    // 2. Analyze AST & Logic Traps
    const logicalWarnings = inspectSQLLogic(rawSql, syntaxResult.ast);
    renderDiagnostics(logicalWarnings);

    // 3. Extract Structure for Visual Diagram
    const parsedStructure = extractQueryStructure(rawSql, syntaxResult.ast);

    // 4. Render Flow, Explanation, & Optimizations
    renderVisualFlow(parsedStructure);
    renderNarrativeExplanation(parsedStructure, rawSql, logicalWarnings);
    renderOptimizations(parsedStructure, rawSql, logicalWarnings);

    // 5. Save to Local History
    const issueSummary = logicalWarnings.length > 0 
        ? `${logicalWarnings.length} issue(s) flagged` 
        : 'Valid Query';
    saveToHistory(rawSql, logicalWarnings.length > 0 ? 'warning' : 'success', issueSummary);
}

/**
 * 1. SQL Syntax Parser Engine
 */
function parseSQLSyntax(sql) {
    const parser = getParserInstance();

    if (!parser) {
        return {
            ast: null,
            error: {
                severity: 'SYNTAX_ERROR',
                type: 'Parser Engine Unloaded',
                desc: 'The SQL Parser script has not finished loading or is missing.',
                location: 'Client Runtime',
                fix: 'Verify CDN script tag placement in index.html.'
            }
        };
    }

    try {
        const ast = parser.astify(sql, { database: 'mysql' });
        return { ast: ast, error: null };
    } catch (err) {
        let errorMsg = err.message || "Invalid SQL syntax.";
        let line = null;
        let column = null;

        if (err.location && err.location.start) {
            line = err.location.start.line;
            column = err.location.start.column;
        }

        return {
            ast: null,
            error: {
                severity: 'SYNTAX_ERROR',
                type: 'Syntax Error (Grammar Compiler)',
                desc: errorMsg,
                location: line && column ? `Line ${line}, Column${column}` : 'Unknown position',
                fix: 'Check for missing/misspelled keywords, unclosed clauses, or trailing commas near the error location.'
            }
        };
    }
}

/**
 * 2. Logic Trap Inspector
 */
function inspectSQLLogic(sql, ast) {
    const warnings = [];

    if (/\bWHERE\b.*\bOR\b.*\bAND\b/i.test(sql) && !/\(.*OR.*\)/i.test(sql)) {
        warnings.push({
            severity: 'LOGIC_TRAP',
            type: 'AND/OR Operator Precedence',
            desc: 'Unparenthesized OR conditions combined with AND may produce unexpected filter conditions due to AND having higher precedence.',
            location: 'WHERE Clause',
            fix: 'Add explicit parentheses around OR conditions: WHERE (colA = 1 OR colB = 2) AND colC = 3.'
        });
    }

    if (/\bLEFT\s+JOIN\b/i.test(sql) && /\bWHERE\b/i.test(sql)) {
        const whereClause = sql.split(/\bWHERE\b/i)[1] || '';
        if (/=\s*'[^']*'|=\s*\d+|IS NOT NULL/i.test(whereClause) && !/IS NULL/i.test(whereClause)) {
            warnings.push({
                severity: 'LOGIC_TRAP',
                type: 'LEFT JOIN converted to INNER JOIN',
                desc: 'Filtering right-table columns in the WHERE clause removes NULL rows, turning your LEFT JOIN into an INNER JOIN.',
                location: 'WHERE Clause / JOIN',
                fix: 'Move the condition into the JOIN ON clause, or use IS NULL check if searching for missing rows.'
            });
        }
    }

    return warnings;
}

/**
 * 3. Extract AST Query Structure
 */
function extractQueryStructure(sql, ast) {
    const structure = {
        raw: sql,
        from: '',
        joins: [],
        where: '',
        groupBy: '',
        orderBy: '',
        limit: '',
        select: [],
        isSelectAll: false
    };

    const selectMatch = sql.match(/\bSELECT\s+(.*?)\s+\bFROM\b/is);
    if (selectMatch) {
        const selectStr = selectMatch[1].trim();
        if (selectStr === '*' || selectStr.includes('*')) {
            structure.isSelectAll = true;
        }
        structure.select = selectStr
            .split(/,(?![^(]*\))/)
            .map(s => s.trim())
            .filter(Boolean);
    }

    const fromMatch = sql.match(/\bFROM\s+([`\w]+)/i);
    if (fromMatch) structure.from = fromMatch[1];

    const whereMatch = sql.match(/\bWHERE\s+(.*?)(?=\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/is);
    if (whereMatch) structure.where = whereMatch[1].trim();

    const groupMatch = sql.match(/\bGROUP\s+BY\s+(.*?)(?=\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/is);
    if (groupMatch) structure.groupBy = groupMatch[1].trim();

    const orderMatch = sql.match(/\bORDER\s+BY\s+(.*?)(?=\bLIMIT\b|$)/is);
    if (orderMatch) structure.orderBy = orderMatch[1].trim();

    const limitMatch = sql.match(/\bLIMIT\s+(\d+)/i);
    if (limitMatch) structure.limit = limitMatch[1];

    const joinRegex = /\b(LEFT\s+OUTER|RIGHT\s+OUTER|FULL\s+OUTER|LEFT|RIGHT|INNER|CROSS)?\s*JOIN\s+([`\w]+)(?:\s+(?:AS\s+)?([`\w]+))?\s+ON\s+(.*?)(?=\b(?:LEFT|RIGHT|INNER|CROSS|FULL)?\s*JOIN\b|\bWHERE\b|\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/gis;
    let match;
    while ((match = joinRegex.exec(sql)) !== null) {
        structure.joins.push({
            type: (match[1] || 'INNER').trim().toUpperCase() + ' JOIN',
            table: match[3] ? `${match[2]} AS ${match[3]}` : match[2],
            condition: match[4] ? match[4].trim() : 'Missing ON condition'
        });
    }

    return structure;
}

/**
 * 4. Diagnostics Render
 */
function renderDiagnostics(diagnostics) {
    const section = document.getElementById('errorSection');
    const container = document.getElementById('diagnosticsContainer');
    if (!container) return;

    if (!diagnostics || diagnostics.length === 0) {
        if (section) section.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    if (section) section.classList.remove('hidden');

    let html = '<div class="space-y-2.5">';
    diagnostics.forEach(diag => {
        const isError = diag.severity === 'SYNTAX_ERROR';
        const badgeColor = isError ? 'bg-red-950/80 text-red-300 border-red-500/40' : 'bg-amber-950/80 text-amber-300 border-amber-500/40';

        html += `
            <div class="p-3.5 rounded-xl bg-black/40 border border-emerald-500/10 space-y-2">
                <div class="flex items-center justify-between">
                    <span class="font-semibold text-xs text-slate-200 flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full ${isError ? 'bg-red-400 animate-pulse' : 'bg-amber-400'}"></span>
                        ${escapeXml(diag.type)}
                    </span>
                    <span class="text-[10px] font-mono px-2 py-0.5 rounded-full border ${badgeColor}">
                        ${escapeXml(diag.severity)}
                    </span>
                </div>
                <div class="text-[11px] font-mono text-amber-300/80">
                    📍 Location: ${escapeXml(diag.location)}
                </div>
                <p class="text-xs text-slate-300/90 leading-relaxed bg-black/30 p-2.5 rounded-lg border border-white/5">
                    ${escapeXml(diag.desc)}
                </p>
                ${diag.fix ? `
                    <div class="text-xs text-emerald-300/90 bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-500/30">
                        💡 <b>Suggested Fix:</b> ${escapeXml(diag.fix)}
                    </div>
                ` : ''}
            </div>
        `;
    });
    html += '</div>';

    container.innerHTML = html;
}

/**
 * 5. Dynamic SVG Flow Diagram Renderer
 */
function renderVisualFlow(parsed) {
    const container = document.getElementById('visualCanvasContainer');
    if (!container) return;

    const rawNodes = [];

    rawNodes.push({
        type: 'source',
        title: 'FROM: ' + (parsed.from || 'Base Table'),
        desc: 'Scan source table records',
        color: '#0d2818',
        borderColor: '#10b981',
        icon: 'TABLE'
    });

    if (parsed.joins && parsed.joins.length > 0) {
        parsed.joins.forEach(j => {
            rawNodes.push({
                type: 'join',
                title: `${j.type} ${j.table}`,
                desc: `ON: ${j.condition}`,
                color: '#0f321e',
                borderColor: '#34d399',
                icon: 'JOIN'
            });
        });
    }

    if (parsed.where) {
        rawNodes.push({
            type: 'filter',
            title: 'WHERE FILTER',
            desc: parsed.where,
            color: '#133a24',
            borderColor: '#6ee7b7',
            icon: 'FILTER'
        });
    }

    if (parsed.groupBy) {
        rawNodes.push({
            type: 'aggregate',
            title: 'GROUP BY',
            desc: `Partition: ${parsed.groupBy}`,
            color: '#0e2b1b',
            borderColor: '#10b981',
            icon: 'GROUP'
        });
    }

    const fieldsStr = parsed.select && parsed.select.length > 0 ? parsed.select.join(', ') : '*';
    rawNodes.push({
        type: 'project',
        title: 'SELECT PROJECTION',
        desc: parsed.isSelectAll ? 'All columns (*)' : fieldsStr,
        color: '#081d12',
        borderColor: '#059669',
        icon: 'SELECT'
    });

    if (parsed.orderBy || parsed.limit) {
        rawNodes.push({
            type: 'output',
            title: 'ORDER / LIMIT',
            desc: [parsed.orderBy ? `Sort: ${parsed.orderBy}` : '', parsed.limit ? `Limit: ${parsed.limit}` : ''].filter(Boolean).join(' | '),
            color: '#05140c',
            borderColor: '#047857',
            icon: 'RESULT'
        });
    }

    const minWidth = 200;
    const maxWidth = 320;
    const minHeight = 90;
    const horizontalGap = 40;
    const paddingHorizontal = 30;

    const nodes = rawNodes.map(node => {
        const titleLen = (node.title || '').length;
        const descLen = (node.desc || '').length;
        const maxCharCount = Math.max(titleLen, descLen);

        let computedWidth = Math.max(minWidth, Math.min(maxWidth, maxCharCount * 8 + 30));
        let estimatedLines = Math.ceil((descLen * 7) / (computedWidth - 20));
        let computedHeight = minHeight + Math.max(0, (estimatedLines - 1) * 14);

        return {
            ...node,
            width: computedWidth,
            height: computedHeight
        };
    });

    let currentX = paddingHorizontal;
    const positionedNodes = nodes.map(node => {
        const x = currentX;
        currentX += node.width + horizontalGap;
        return { ...node, x };
    });

    const maxNodeHeight = Math.max(...positionedNodes.map(n => n.height));
    const totalWidth = Math.max(800, currentX + paddingHorizontal - horizontalGap);
    const svgHeight = maxNodeHeight + 60;
    const centerY = svgHeight / 2;

    let svgContent = `
    <svg id="sqlFlowSvg" width="${totalWidth}" height="${svgHeight}" viewBox="0 0 ${totalWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg" class="mx-auto block">
    <defs>
    <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#059669" stop-opacity="0.8"/>
    <stop offset="100%" stop-color="#34D399" stop-opacity="0.8"/>
    </linearGradient>
    <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="#34D399"/>
    </marker>
    </defs>
    `;

    positionedNodes.forEach((node, index) => {
        if (index < positionedNodes.length - 1) {
            const nextNode = positionedNodes[index + 1];
            const x1 = node.x + node.width;
            const y1 = centerY;
            const x2 = nextNode.x;
            const y2 = centerY;

            svgContent += `
            <path d="M ${x1} ${y1} C ${x1 + 20} ${y1}, ${x2 - 20} ${y2}, ${x2} ${y2}"
            stroke="url(#lineGrad)" stroke-width="2.5" fill="none" marker-end="url(#arrow)" />
            `;
        }
    });

    positionedNodes.forEach(node => {
        const y = centerY - (node.height / 2);

        svgContent += `
        <g transform="translate(${node.x}, ${y})">
        <rect width="${node.width}" height="${node.height}" rx="16" fill="${node.color}" stroke="${node.borderColor}" stroke-opacity="0.4" stroke-width="1.5" />

        <rect x="12" y="12" width="55" height="18" rx="6" fill="rgba(0,0,0,0.5)" stroke="${node.borderColor}" stroke-opacity="0.3" stroke-width="1"/>
        <text x="39.5" y="24" fill="#6EE7B7" font-size="9" font-family="monospace" font-weight="bold" text-anchor="middle">${escapeXml(node.icon)}</text>

        <text x="12" y="46" fill="#F8FAFC" font-size="11" font-family="sans-serif" font-weight="600">${escapeXml(node.title)}</text>

        <text x="12" y="66" fill="#A7F3D0" font-size="10" font-family="monospace">${escapeXml(node.desc)}</text>
        </g>
        `;
    });

    svgContent += `</svg>`;
    container.innerHTML = svgContent;
}

/**
 * 6. Narrative Explanation
 */
function renderNarrativeExplanation(parsed, rawSql, errors) {
    const container = document.getElementById('explanationContainer');
    const lines = [];
    const add = (text) => lines.push(text);

    const hasSyntaxError = errors.some(e => e.severity === 'SYNTAX_ERROR' || (e.severity === 'ERROR' && e.type.toLowerCase().includes('syntax')));
    const hasAndOrBug = errors.some(e => e.type.includes('AND/OR'));
    const hasLeftJoinBug = errors.some(e => e.type.includes('LEFT JOIN'));
    const hasJoin = Array.isArray(parsed.joins) && parsed.joins.length > 0;
    const hasAggregation = Boolean(parsed.groupBy) || /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(rawSql);
    const hasHaving = /\bHAVING\b/i.test(rawSql);
    const hasOrderBy = Boolean(parsed.orderBy);
    const selectedColumns = parsed.select?.length ? parsed.select.join(', ') : 'the selected columns';

    if (hasSyntaxError) {
        add('<b>1. Goal:</b> The query cannot be analyzed reliably until its syntax errors are fixed.');
        add('<b>2. Rule:</b> First make the query valid; then inspect what happens to the data at every stage.');
    } else {
        add(`<b>1. Goal:</b> Returns <code>${escapeXml(selectedColumns)}</code> from <code>${escapeXml(parsed.from || 'the source table')}</code>.`);
        add(`<b>2. Tables:</b> Scans <code>${escapeXml(parsed.from || 'the base table')}</code>${hasJoin ? ` and connects ${parsed.joins.length} joined table(s).` : '.'}`);
        add(`<b>3. Grain:</b> ${parsed.groupBy ? `Grouped grain of <code>${escapeXml(parsed.groupBy)}</code>.` : hasAggregation ? 'Aggregated summary grain.' : 'Source row level.'}`);
        add(`<b>4. Data Flow:</b> Executed as <code>FROM → JOIN → WHERE${hasAggregation ? ' → GROUP BY' : ''}${hasHaving ? ' → HAVING' : ''} → SELECT${hasOrderBy ? ' → ORDER BY' : ''}</code>.`);

        if (hasJoin) {
            add('<b>5. JOIN Check:</b> Inspect relationship cardinality to prevent duplicate record inflation.');
        }
        if (parsed.where) {
            add('<b>6. Filter Check:</b> WHERE filters rows before grouping. Verify AND/OR precedence and NULL handling.');
        }
        if (hasAggregation) {
            add('<b>7. Calculations:</b> Verify aggregate functions (COUNT, SUM, AVG) at the grouped grain.');
        }
    }

    if (hasAndOrBug) {
        add('🚨 <b>Logic Warning:</b> AND runs before OR. Use parentheses to ensure correct filter scope.');
    }
    if (hasLeftJoinBug) {
        add('🚨 <b>LEFT JOIN Warning:</b> WHERE clause condition converts LEFT JOIN to INNER JOIN.');
    }

    let html = '<ol class="space-y-2 list-none p-0 m-0 text-xs">';
    lines.forEach(line => {
        html += `
            <li class="flex items-start gap-2.5 bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-500/10">
                <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0"></span>
                <div class="leading-relaxed text-slate-300">${line}</div>
            </li>
        `;
    });
    html += '</ol>';

    container.innerHTML = html;
}

/**
 * 7. Optimization Suggestions Render
 */
function renderOptimizations(parsed = {}, rawSql = '', errors = []) {
    const container = document.getElementById('optimizationContainer');
    if (!container) return;

    let cleanSql = typeof rawSql === 'string' ? rawSql.trim() : '';
    const safeErrors = Array.isArray(errors) ? errors : [];
    const safeJoins = Array.isArray(parsed.joins) ? parsed.joins : [];
    const where = parsed.where || '';
    const groupBy = parsed.groupBy || '';
    const orderBy = parsed.orderBy || '';
    const tips = [];

    const hasSyntaxError = safeErrors.some(e => e && e.severity === 'SYNTAX_ERROR');
    const hasAndOrTrap = safeErrors.some(e => e && String(e.type || '').includes('AND/OR'));
    const hasLeftJoinTrap = safeErrors.some(e => e && String(e.type || '').includes('LEFT JOIN'));

    const hasAggregation = Boolean(groupBy) || /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(cleanSql);
    const hasDistinct = /\bDISTINCT\b/i.test(cleanSql);
    const hasFunctionsOnFilters = Boolean(where) && /\b(LOWER|UPPER|DATE|YEAR|MONTH|CAST|CONVERT|COALESCE)\s*\(/i.test(where);

    const addTip = (type, title, detail) => tips.push({ type, title, detail });

    if (hasSyntaxError) {
        addTip('correctness', 'Fix syntax before optimization', 'A query must run successfully before its performance can be evaluated.');
    } else {
        if (parsed.isSelectAll === true || /\bSELECT\s+\*/i.test(cleanSql)) {
            addTip('performance', 'Avoid SELECT *', 'Explicitly select required columns to decrease network transfer and memory overhead.');
        }
        if (hasFunctionsOnFilters) {
            addTip('index', 'Functions on filtered columns', 'Functions applied to WHERE columns prevent standard index lookup (sargability).');
        }
        if (safeJoins.length > 0) {
            addTip('latency', 'Inspect JOIN cardinality', 'Verify key relationships to avoid unintentional row multiplication.');
        }
        if (orderBy && !/\bLIMIT\b/i.test(cleanSql)) {
            addTip('memory', 'Unbounded sorting', 'ORDER BY without LIMIT may perform expensive full sorts in memory.');
        }
        if (hasDistinct) {
            addTip('aggregation', 'Review DISTINCT', 'DISTINCT requires sorting/hashing overhead. Verify if grain or JOIN design is the cause.');
        }
        if (hasAndOrTrap) {
            addTip('correctness', 'Fix AND/OR precedence', 'Wrap OR conditions in parentheses for expected filter evaluation.');
        }
        if (hasLeftJoinTrap) {
            addTip('correctness', 'Preserve LEFT JOIN behavior', 'Move right-table WHERE filter conditions to the JOIN ON clause.');
        }
    }

    let refinedQuery = cleanSql;
    if (refinedQuery) {
        refinedQuery = refinedQuery
            .replace(/\s+/g, ' ')
            .replace(/\b(SELECT|FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|INNER JOIN|LEFT JOIN|RIGHT JOIN|CROSS JOIN|JOIN|UNION|ON)\b/gi, '\n$1')
            .replace(/\b(AND|OR)\b/gi, '\n  $1')
            .trim();
    }

    let html = '';
    if (tips.length === 0) {
        html += `
            <div class="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300">
                ✨ Excellent query structure! No obvious performance traps found.
            </div>
        `;
    } else {
        html += '<div class="space-y-2">';
        tips.forEach(tip => {
            let badgeClass = 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40';
            if (tip.type === 'performance' || tip.type === 'index') badgeClass = 'bg-amber-950/80 text-amber-300 border-amber-500/40';
            if (tip.type === 'correctness') badgeClass = 'bg-red-950/80 text-red-300 border-red-500/40';

            html += `
                <div class="p-3 rounded-xl bg-black/40 border border-emerald-500/10 flex flex-col gap-1">
                    <div class="flex items-center justify-between">
                        <span class="font-semibold text-white text-xs">${escapeXml(tip.title)}</span>
                        <span class="text-[10px] font-mono px-2 py-0.5 rounded-full border ${badgeClass}">${tip.type.toUpperCase()}</span>
                    </div>
                    <p class="text-slate-300/80 text-xs leading-relaxed">${escapeXml(tip.detail)}</p>
                </div>
            `;
        });
        html += '</div>';
    }

    html += `
        <div class="mt-3 p-3 rounded-xl bg-black/50 border border-emerald-500/20">
            <div class="text-xs font-semibold text-emerald-300 mb-1.5">Refined Query</div>
            <pre class="text-xs text-emerald-200 font-mono whitespace-pre-wrap overflow-x-auto bg-black/40 p-3 rounded-lg border border-white/5">${escapeXml(refinedQuery || cleanSql)}</pre>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * 8. Export PNG
 */
function exportVisualAsPNG() {
    const svgElem = document.getElementById('sqlFlowSvg');
    if (!svgElem) {
        showNotification("No visual flow diagram available to export.");
        return;
    }

    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svgElem);
    if (!svgString.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const blobURL = (window.URL || window.webkitURL).createObjectURL(svgBlob);
    const img = new Image();

    const viewBox = svgElem.viewBox.baseVal;
    const width = (viewBox && viewBox.width) ? viewBox.width : 800;
    const height = (viewBox && viewBox.height) ? viewBox.height : 300;

    img.onload = function () {
        const canvas = document.createElement('canvas');
        canvas.width = width * 2;
        canvas.height = height * 2;
        const ctx = canvas.getContext('2d');
        ctx.scale(2, 2);

        ctx.fillStyle = '#050d08';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0);

        const pngUrl = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = pngUrl;
        downloadLink.download = `querylens-flow-${Date.now()}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        URL.revokeObjectURL(blobURL);
    };

    img.src = blobURL;
}

/**
 * 9. HISTORY FEATURE (localStorage)
 */
function saveToHistory(sql, status, summary) {
    const historyItem = {
        id: Date.now(),
        sql: sql,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString(),
        status: status,
        summary: summary
    };

    // Filter duplicates
    analysisHistory = analysisHistory.filter(item => item.sql !== sql);
    analysisHistory.unshift(historyItem);

    if (analysisHistory.length > 20) analysisHistory.pop();

    try {
        localStorage.setItem('querylens_history', JSON.stringify(analysisHistory));
    } catch (e) {}

    renderHistoryUI();
}

function loadHistory() {
    try {
        const stored = localStorage.getItem('querylens_history');
        if (stored) {
            analysisHistory = JSON.parse(stored);
        }
    } catch (e) {
        analysisHistory = [];
    }
    renderHistoryUI();
}

function renderHistoryUI() {
    const container = document.getElementById('historyContainer');
    if (!container) return;

    if (analysisHistory.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 text-center py-8">No query history stored yet.</p>`;
        return;
    }

    let html = '';
    analysisHistory.forEach((item, index) => {
        let statusBadge = item.status === 'error' 
            ? 'bg-red-950/80 text-red-300 border-red-500/40' 
            : item.status === 'warning' 
            ? 'bg-amber-950/80 text-amber-300 border-amber-500/40' 
            : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40';

        html += `
            <div class="p-3.5 rounded-2xl bg-black/40 border border-emerald-500/15 flex flex-col gap-2 hover:border-emerald-500/30 transition-all">
                <div class="flex items-center justify-between">
                    <span class="text-[11px] text-slate-400">${item.date} at ${item.timestamp}</span>
                    <span class="text-[10px] font-mono px-2 py-0.5 rounded-full border ${statusBadge}">${item.summary}</span>
                </div>
                <pre class="text-xs text-emerald-300 font-mono whitespace-pre-wrap line-clamp-2 bg-black/30 p-2 rounded-lg border border-white/5">${escapeXml(item.sql)}</pre>
                <div class="flex items-center justify-end gap-2 pt-1">
                    <button onclick="deleteHistoryItem(${item.id})" class="text-xs text-slate-400 hover:text-red-400 px-2 py-1">Delete</button>
                    <button onclick="loadQueryFromHistory(${index})" class="text-xs text-emerald-400 hover:text-emerald-300 font-medium px-3 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/30">Load Query →</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function loadQueryFromHistory(index) {
    const item = analysisHistory[index];
    if (item) {
        const inputElem = document.getElementById('sqlInput');
        if (inputElem) {
            inputElem.value = item.sql;
            closeOverlay('historyModal');
            processQuery();
        }
    }
}

function deleteHistoryItem(id) {
    analysisHistory = analysisHistory.filter(i => i.id !== id);
    try {
        localStorage.setItem('querylens_history', JSON.stringify(analysisHistory));
    } catch (e) {}
    renderHistoryUI();
}

function clearHistory() {
    if (confirm("Are you sure you want to clear all analysis history?")) {
        analysisHistory = [];
        try {
            localStorage.removeItem('querylens_history');
        } catch (e) {}
        renderHistoryUI();
    }
}

/**
 * 10. EXAMPLES FEATURE
 */
const SQL_EXAMPLES = [
    {
        category: 'LOGIC TRAPS',
        title: 'LEFT JOIN + WHERE Filter Trap',
        desc: 'Filtering a LEFT JOINed table in WHERE converts it into an INNER JOIN by dropping NULL rows.',
        sql: `SELECT o.order_id, c.customer_name\nFROM orders o\nLEFT JOIN customers c ON o.customer_id = c.id\nWHERE c.status = 'active';`
    },
    {
        category: 'LOGIC TRAPS',
        title: 'AND / OR Operator Precedence',
        desc: 'AND has higher precedence than OR. Unparenthesized conditions produce unexpected filter matches.',
        sql: `SELECT * FROM products\nWHERE category = 'Electronics' OR category = 'Gadgets'\nAND price < 100;`
    },
    {
        category: 'BASIC',
        title: 'Simple SELECT & Filter',
        desc: 'Standard query with simple WHERE filtering.',
        sql: `SELECT id, username, email\nFROM users\nWHERE status = 'active'\nORDER BY created_at DESC;`
    },
    {
        category: 'JOINS & GRAIN',
        title: 'Multiple JOINs with Aggregation',
        desc: 'GROUP BY aggregation across joined tables.',
        sql: `SELECT u.id, u.username, COUNT(o.id) as total_orders\nFROM users u\nINNER JOIN orders o ON u.id = o.user_id\nGROUP BY u.id, u.username\nHAVING count(o.id) > 5;`
    },
    {
        category: 'OPTIMIZATION',
        title: 'Function Applied on Filter Column',
        desc: 'Using functions on WHERE columns prevents index usage.',
        sql: `SELECT * FROM employees\nWHERE LOWER(last_name) = 'smith';`
    }
];

function initExamples() {
    const container = document.getElementById('examplesContainer');
    if (!container) return;

    let html = '';
    SQL_EXAMPLES.forEach((ex, idx) => {
        html += `
            <div class="p-4 rounded-2xl bg-black/40 border border-emerald-500/15 flex flex-col gap-2 hover:border-emerald-500/30 transition-all">
                <div class="flex items-center justify-between">
                    <h4 class="text-sm font-semibold text-white">${escapeXml(ex.title)}</h4>
                    <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">${ex.category}</span>
                </div>
                <p class="text-xs text-slate-300/80 leading-relaxed">${escapeXml(ex.desc)}</p>
                <pre class="text-xs text-emerald-300 font-mono bg-black/40 p-2.5 rounded-lg border border-white/5 whitespace-pre-wrap">${escapeXml(ex.sql)}</pre>
                <div class="flex justify-end pt-1">
                    <button onclick="loadExampleQuery(${idx})" class="text-xs text-emerald-400 hover:text-emerald-300 font-medium px-4 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/30 transition-all">
                        Load Example →
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function loadExampleQuery(idx) {
    const example = SQL_EXAMPLES[idx];
    if (example) {
        const inputElem = document.getElementById('sqlInput');
        if (inputElem) {
            inputElem.value = example.sql;
            closeOverlay('examplesModal');
            processQuery();
        }
    }
}

/**
 * Overlay Controls
 */
function openOverlay(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('hidden');
}

function closeOverlay(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('hidden');
}

function switchTab(tabName) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (tabName === 'home') {
        const navHome = document.getElementById('navHome');
        if (navHome) navHome.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

/**
 * Proximity / Magnetic Micro-Interactions
 */
function setupProximityInteractions() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const cards = document.querySelectorAll('.magnetic-card');

    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;

            const moveX = (x / rect.width) * 6;
            const moveY = (y / rect.height) * 6;

            card.style.transform = `translate3d(${moveX}px, ${moveY}px, 0)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translate3d(0, 0, 0)';
        });
    });
}
