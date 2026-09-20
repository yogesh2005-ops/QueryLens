/**
 * Utility: HTML Escaper to prevent XSS / UI Breaks
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
 * Helper to safely instantiate NodeSQLParser across UMD / Browser builds
 */
function getParserInstance() {
    // 1. Standard global constructor: new NodeSQLParser.Parser()
    if (typeof NodeSQLParser !== 'undefined' && typeof NodeSQLParser.Parser === 'function') {
        return new NodeSQLParser.Parser();
    }
    // 2. Direct class export: new NodeSQLParser()
    if (typeof NodeSQLParser === 'function') {
        return new NodeSQLParser();
    }
    // 3. Object export with direct method: window.NodeSQLParser
    if (typeof NodeSQLParser !== 'undefined' && typeof NodeSQLParser.astify === 'function') {
        return NodeSQLParser;
    }
    // 4. Fallback global: new Parser()
    if (typeof Parser === 'function') {
        return new Parser();
    }
    return null;
}

/**
 * Helper UI Notifications
 */
function showNotification(msg) {
    alert(msg);
}

function clearVisuals() {
    const canvas = document.getElementById('visualCanvasContainer');
    if (canvas) canvas.innerHTML = '';
}

/**
 * Main Processing Workflow
 * 1. Validate Syntax with AST Parser -> 2. Inspect Logic Traps -> 3. Render Visuals
 */
function processQuery() {
    const inputElem = document.getElementById('sqlInput');
    if (!inputElem) return;

    const rawSql = inputElem.value.trim();
    if (!rawSql) {
        showNotification("Please enter a SQL query to inspect.");
        return;
    }

    // Step 1: Syntax Parsing via Node SQL Parser
    const syntaxResult = parseSQLSyntax(rawSql);

    if (syntaxResult.error) {
        // Show diagnostic panel with syntax error and stop flow
        renderDiagnostics([syntaxResult.error]);
        clearVisuals();
        renderNarrativeExplanation({}, rawSql, [syntaxResult.error]);
        renderOptimizations({}, rawSql, [syntaxResult.error]);
        return;
    }

    // Step 2: Analyze AST & String Patterns for Logical Traps
    const logicalWarnings = inspectSQLLogic(rawSql, syntaxResult.ast);
    renderDiagnostics(logicalWarnings);

    // Step 3: Extract Structure for Visual Flow Diagram
    const parsedStructure = extractQueryStructure(rawSql, syntaxResult.ast);

    // Step 4: Render SVG Flow, Narrative, & Optimizations
    renderVisualFlow(parsedStructure);
    renderNarrativeExplanation(parsedStructure, rawSql, logicalWarnings);
    renderOptimizations(parsedStructure, rawSql, logicalWarnings);
}

/**
 * 1. Real SQL Syntax Parser
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
        // Fix: Changed 'MySQL' (capitalized) to 'mysql' (lowercase)
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
                location: line && column ? `Line ${line}, Column ${column}` : 'Unknown position',
                fix: 'Check for missing/misspelled keywords, unclosed clauses, or trailing commas near the error location.'
            }
        };
    }
}

/**
 * 2. Logical & Performance Trap Inspector
 */
function inspectSQLLogic(sql, ast) {
    const warnings = [];

    // Check AND/OR Precedence
    if (/\bWHERE\b.*\bOR\b.*\bAND\b/i.test(sql) && !/\(.*OR.*\)/i.test(sql)) {
        warnings.push({
            severity: 'LOGIC_TRAP',
            type: 'AND/OR Operator Precedence',
            desc: 'Unparenthesized OR conditions combined with AND may produce unexpected filter conditions due to AND having higher precedence.',
            location: 'WHERE Clause',
            fix: 'Add explicit parentheses around OR conditions: WHERE (colA = 1 OR colB = 2) AND colC = 3.'
        });
    }

    // Check LEFT JOIN converted to INNER JOIN
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

    // Regex Fallback Extractor if AST structure varies
    const fromMatch = sql.match(/\bFROM\s+([`\w]+)/i);
    if (fromMatch) structure.from = fromMatch[1];

    const whereMatch = sql.match(/\bWHERE\s+(.*?)(?=\bGROUP\b|\bORDER\b|\bLIMIT\b|$)/i);
    if (whereMatch) structure.where = whereMatch[1].trim();

    const groupMatch = sql.match(/\bGROUP\s+BY\s+(.*?)(?=\bHAVING\b|\bORDER\b|\bLIMIT\b|$)/i);
    if (groupMatch) structure.groupBy = groupMatch[1].trim();

    const orderMatch = sql.match(/\bORDER\s+BY\s+(.*?)(?=\bLIMIT\b|$)/i);
    if (orderMatch) structure.orderBy = orderMatch[1].trim();

    const limitMatch = sql.match(/\bLIMIT\s+(\d+)/i);
    if (limitMatch) structure.limit = limitMatch[1];

    if (/\bSELECT\s+\*/i.test(sql)) {
        structure.isSelectAll = true;
    }

    // Extract JOINs
    const joinRegex = /\b(LEFT|RIGHT|INNER|CROSS)?\s*JOIN\s+([`\w]+)(?:\s+ON\s+(.*?))?(?=\bLEFT\b|\bRIGHT\b|\bINNER\b|\bCROSS\b|\bJOIN\b|\bWHERE\b|\bGROUP\b|\bORDER\b|\bLIMIT\b|$)/gi;
    let match;
    while ((match = joinRegex.exec(sql)) !== null) {
        structure.joins.push({
            type: (match[1] || 'INNER').toUpperCase() + ' JOIN',
            table: match[2],
            condition: match[3] || 'Missing ON condition'
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
        container.innerHTML = `
        <div class="p-3 rounded-lg bg-emerald-950/30 border border-emerald-700/40 text-xs text-emerald-300">
        ✓ No syntax errors or logical traps detected.
        </div>
        `;
        return;
    }

    // Unhide the diagnostic section when issues exist
    if (section) section.classList.remove('hidden');

    let html = '<div class="space-y-2.5">';
    diagnostics.forEach(diag => {
        const isError = diag.severity === 'SYNTAX_ERROR';
        const badgeColor = isError ? 'bg-red-900/50 text-red-300 border-red-700/60' : 'bg-amber-900/50 text-amber-300 border-amber-700/60';

        html += `
        <div class="p-3 rounded-lg bg-forest-950/60 border border-earth-borderDark/60 space-y-1.5">
        <div class="flex items-center justify-between">
        <span class="font-semibold text-xs text-earth-textDark flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full ${isError ? 'bg-red-400' : 'bg-amber-400'}"></span>
        ${escapeXml(diag.type)}
        </span>
        <span class="text-[10px] font-mono px-1.5 py-0.5 rounded border ${badgeColor}">
        ${escapeXml(diag.severity)}
        </span>
        </div>
        <div class="text-[11px] font-mono text-amber-200/80">
        📍 Location: ${escapeXml(diag.location)}
        </div>
        <p class="text-xs text-forest-200/90 leading-relaxed bg-black/30 p-2 rounded">
        ${escapeXml(diag.desc)}
        </p>
        ${diag.fix ? `
            <div class="text-xs text-emerald-300/90 bg-emerald-950/40 p-2 rounded border border-emerald-800/40">
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
        color: '#2C4A3E',
        icon: 'TABLE'
    });

    if (parsed.joins && parsed.joins.length > 0) {
        parsed.joins.forEach(j => {
            rawNodes.push({
                type: 'join',
                title: `${j.type} ${j.table}`,
                desc: `ON: ${j.condition}`,
                color: j.type.includes('LEFT') ? '#28493B' : '#345E4C',
                icon: 'JOIN'
            });
        });
    }

    if (parsed.where) {
        rawNodes.push({
            type: 'filter',
            title: 'WHERE FILTER',
            desc: parsed.where,
            color: '#385243',
            icon: 'FILTER'
        });
    }

    if (parsed.groupBy) {
        rawNodes.push({
            type: 'aggregate',
            title: 'GROUP BY',
            desc: `Partition by: ${parsed.groupBy}`,
            color: '#2D4D3E',
            icon: 'GROUP'
        });
    }

    const fieldsStr = parsed.select && parsed.select.length > 0 ? parsed.select.join(', ') : '*';
    rawNodes.push({
        type: 'project',
        title: 'SELECT PROJECTION',
        desc: parsed.isSelectAll ? 'All columns (*)' : fieldsStr,
        color: '#1C3A2B',
        icon: 'SELECT'
    });

    if (parsed.orderBy || parsed.limit) {
        rawNodes.push({
            type: 'output',
            title: 'ORDER / LIMIT',
            desc: [parsed.orderBy ? `Sort: ${parsed.orderBy}` : '', parsed.limit ? `Limit: ${parsed.limit}` : ''].filter(Boolean).join(' | '),
            color: '#152C21',
            icon: 'RESULT'
        });
    }

    const minWidth = 200;
    const maxWidth = 340;
    const minHeight = 85;
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
                <stop offset="0%" stop-color="#345E4C" stop-opacity="0.8"/>
                <stop offset="100%" stop-color="#10B981" stop-opacity="0.8"/>
            </linearGradient>
            <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#10B981"/>
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
            <g class="node-glow" transform="translate(${node.x}, ${y})">
                <rect width="${node.width}" height="${node.height}" rx="10" fill="${node.color}" stroke="#3D5A4B" stroke-width="1.5" />
                <foreignObject x="0" y="0" width="${node.width}" height="${node.height}">
                    <div xmlns="http://www.w3.org/1999/xhtml" class="p-2.5 h-full flex flex-col justify-between text-left font-sans select-none leading-tight overflow-hidden">
                        <div>
                            <div class="inline-block bg-black/40 text-[#A7F3D0] text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-500/20 mb-1">
                                ${escapeXml(node.icon)}
                            </div>
                            <div class="text-[11px] font-semibold text-earth-textDark truncate" title="${escapeXml(node.title)}">
                                ${escapeXml(node.title)}
                            </div>
                        </div>
                        <div class="text-[10px] text-forest-200/80 font-mono break-words line-clamp-3 leading-snug">
                            ${escapeXml(node.desc)}
                        </div>
                    </div>
                </foreignObject>
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

    const hasSyntaxError = errors.some(e => e.severity === 'ERROR' && e.type.toLowerCase().includes('syntax'));
    const hasAndOrBug = errors.some(e => e.type.includes('AND/OR'));
    const hasLeftJoinBug = errors.some(e => e.type.includes('LEFT JOIN'));
    const hasJoin = parsed.joins.length > 0;
    const hasAggregation = Boolean(parsed.groupBy) || /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(rawSql);
    const hasHaving = /\bHAVING\b/i.test(rawSql);
    const hasOrderBy = Boolean(parsed.orderBy);
    const selectedColumns = parsed.select?.length ? parsed.select.join(', ') : 'the selected columns';

    if (hasSyntaxError) {
        add('<b>1. Goal:</b> The query cannot be analyzed reliably until its syntax errors are fixed.');
        add('<b>2. Rule:</b> First make the query valid; then inspect what happens to the data at every stage.');
    } else {
        add(`<b>1. Goal:</b> The query is trying to return <code>${escapeXml(selectedColumns)}</code> from <code>${escapeXml(parsed.from || 'the source table')}</code>. Check whether that answers the business question.`);

        add(`<b>2. Tables:</b> Start with <code>${escapeXml(parsed.from || 'the base table')}</code>${hasJoin ? ` and connect ${parsed.joins.length} joined table(s).` : '. No additional tables are involved.'}`);

        add(`<b>3. Grain:</b> Before reading the result, define what one row represents${parsed.groupBy ? `; GROUP BY suggests a grouped grain of <code>${escapeXml(parsed.groupBy)}</code>.` : hasAggregation ? '; an aggregate may change the result from row-level detail to a summary.' : '; currently, matching source rows are the likely grain.'}`);

        add(`<b>4. Data flow:</b> Read it as <code>FROM → JOIN → WHERE${hasAggregation ? ' → GROUP BY' : ''}${hasHaving ? ' → HAVING' : ''} → SELECT${hasOrderBy ? ' → ORDER BY' : ''}</code>. Each stage changes or presents the data differently.`);

        if (hasJoin) {
            add(`<b>5. JOIN check:</b> Inspect the relationship and cardinality. If one row matches multiple rows, the JOIN can multiply records before aggregation.`);
        } else {
            add('<b>5. JOIN check:</b> There are no JOINs, so focus on filters, calculations, and the source-table grain.');
        }

        if (parsed.where) {
            add('<b>6. Filter check:</b> WHERE removes rows before grouping. Check AND/OR precedence, NULL behavior, and whether the filter removes rows you intended to keep.');
        } else {
            add('<b>6. Filter check:</b> No WHERE clause is detected, so all source rows remain until a later stage changes the result.');
        }

        if (hasAggregation) {
            add('<b>7. Calculation check:</b> Validate COUNT, SUM, AVG, CASE, and NULL handling. Confirm that joins have not inflated the values before aggregation.');
        } else {
            add('<b>7. Calculation check:</b> No obvious aggregate is detected. Check selected expressions and whether they match the intended row-level meaning.');
        }

        add(`<b>8. Aggregation check:</b> ${parsed.groupBy ? `Verify that <code>${escapeXml(parsed.groupBy)}</code> is the correct grouping level.` : hasAggregation ? 'Confirm the aggregate is calculated at the intended level; missing GROUP BY may produce one overall result.' : 'No GROUP BY is detected, so there is no explicit grouping stage.'}`);

        add(`<b>9. Final output:</b> Confirm the columns, row count, and grain answer the original question. A query running successfully does not prove the result is trustworthy.`);
    }

    if (hasAndOrBug) {
        add('🚨 <b>Logic warning:</b> AND runs before OR. Use parentheses or IN() so the filter matches your actual intention.');
    }

    if (hasLeftJoinBug) {
        add('🚨 <b>LEFT JOIN warning:</b> A right-table condition in WHERE can remove NULL matches and make the LEFT JOIN behave like an INNER JOIN.');
    }

    const finalLines = lines.slice(0, 10);
    let html = '<ol class="space-y-1.5 list-none p-0 m-0 text-xs">';

    finalLines.forEach(line => {
        html += `
        <li class="flex items-start gap-2 bg-forest-950/40 p-2 rounded border border-earth-borderDark/40">
        <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0"></span>
        <div class="leading-relaxed text-forest-200">${line}</div>
        </li>
        `;
    });

    html += '</ol>';
    container.innerHTML = html;
}

/**
 * 7. Optimization Suggestions & Refined Query Render
 */
function renderOptimizations(parsed = {}, rawSql = '', errors = []) {
    const container = document.getElementById('optimizationContainer');
    if (!container) return;

    let cleanSql = '';
    let safeErrors = [];

    if (typeof rawSql === 'string') {
        cleanSql = rawSql.trim();
        safeErrors = Array.isArray(errors) ? errors : [];
    } else if (Array.isArray(rawSql)) {
        safeErrors = rawSql;
        cleanSql = (parsed && parsed.raw) ? String(parsed.raw) : '';
    }

    const safeJoins = Array.isArray(parsed.joins) ? parsed.joins : [];
    const where = parsed.where || '';
    const groupBy = parsed.groupBy || '';
    const orderBy = parsed.orderBy || '';
    const tips = [];

    const hasSyntaxError = safeErrors.some(
        e => e && e.severity === 'SYNTAX_ERROR'
    );

    const hasAndOrTrap = safeErrors.some(
        e => e && String(e.type || '').includes('AND/OR')
    );

    const hasLeftJoinTrap = safeErrors.some(
        e => e && String(e.type || '').includes('LEFT JOIN')
    );

    const hasAggregation = Boolean(groupBy) || /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(cleanSql);
    const hasDistinct = /\bDISTINCT\b/i.test(cleanSql);
    const hasFunctionsOnFilters = Boolean(where) && /\b(LOWER|UPPER|DATE|YEAR|MONTH|CAST|CONVERT|COALESCE)\s*\(/i.test(where);
    const hasOr = Boolean(where) && /\bOR\b/i.test(where);

    const addTip = (type, title, detail) => {
        tips.push({ type, title, detail });
    };

    if (hasSyntaxError) {
        addTip('correctness', 'Fix syntax before optimization', 'Correct syntax errors first. A query must run successfully before its execution plan and performance can be evaluated.');
    } else {
        if (parsed.isSelectAll === true || /\bSELECT\s+\*/i.test(cleanSql)) {
            addTip('performance', 'Avoid SELECT *', 'Select only the columns required. This can reduce data transfer, I/O, and row width.');
        }

        if (hasFunctionsOnFilters) {
            addTip('index', 'Review functions on filter columns', 'Functions on filtered columns can prevent ordinary index usage. Consider a sargable condition or an appropriate expression index.');
        }

        if (hasOr) {
            addTip('logic', 'Review OR conditions', 'Check whether OR affects selectivity or index usage. Confirm the execution plan before changing the logic.');
        }

        if (safeJoins.length > 0) {
            addTip('latency', 'Inspect JOIN cardinality', 'Check one-to-many and many-to-many relationships. Multiple matches can multiply rows and inflate aggregate results.');
        }

        if (where && safeJoins.length > 0) {
            addTip('performance', 'Reduce unnecessary rows early', 'Filter data before expensive joins or aggregations when this preserves the intended result and JOIN semantics.');
        }

        if (orderBy && !/\bLIMIT\b/i.test(cleanSql)) {
            addTip('memory', 'Review unbounded sorting', 'ORDER BY without LIMIT may sort a large result set. Check whether all rows need to be returned.');
        }

        if (hasAggregation) {
            addTip('aggregation', 'Check aggregation grain', 'Validate GROUP BY, COUNT, SUM, and AVG. Ensure joins do not multiply rows before aggregation.');
        }

        if (hasDistinct) {
            addTip('aggregation', 'Review DISTINCT', 'DISTINCT may hide duplicate-producing joins and require additional sorting or hashing. Check the underlying grain first.');
        }

        if (hasAndOrTrap) {
            addTip('correctness', 'Fix AND/OR precedence', 'Use parentheses or IN() to ensure the filter returns the intended rows before optimizing.');
        }

        if (hasLeftJoinTrap) {
            addTip('correctness', 'Preserve LEFT JOIN behavior', 'A condition on the right table in WHERE can remove unmatched rows. Check whether the condition belongs in ON.');
        }

        if (where || safeJoins.length > 0 || orderBy) {
            addTip('index', 'Check indexes using the execution plan', 'Review indexes on WHERE, JOIN, and ORDER BY columns. Do not add indexes blindly; compare the actual execution plan and write overhead.');
        }
    }

    // Format query
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
            <div class="p-3 rounded-lg bg-emerald-950/30 border border-emerald-700/40 text-xs text-emerald-300">
                God Damn! Master! Why are you even here?
            </div>
        `;
    } else {
        if (tips.length > 3) {
            html += `
                <div class="mb-2 p-2.5 rounded-lg bg-amber-950/30 border border-amber-700/40 text-xs text-amber-300">
                    Slow down, Kiddo let me show you how its done
                </div>
            `;
        }

        html += '<div class="space-y-2">';
        tips.forEach(tip => {
            let badgeClass = 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50';

            if (tip.type === 'performance' || tip.type === 'index') {
                badgeClass = 'bg-amber-900/40 text-amber-300 border-amber-700/50';
            }
            if (tip.type === 'memory' || tip.type === 'latency') {
                badgeClass = 'bg-sky-900/40 text-sky-300 border-sky-700/50';
            }
            if (tip.type === 'correctness' || tip.type === 'logic') {
                badgeClass = 'bg-red-900/40 text-red-300 border-red-700/50';
            }

            html += `
                <div class="p-2.5 rounded-lg bg-forest-950/40 border border-earth-borderDark/50 flex flex-col gap-1">
                    <div class="flex items-center justify-between">
                        <span class="font-semibold text-earth-textDark text-xs">
                            ${escapeXml(tip.title)}
                        </span>
                        <span class="text-[10px] font-mono px-1.5 py-0.5 rounded border ${badgeClass}">
                            ${tip.type.toUpperCase()}
                        </span>
                    </div>
                    <p class="text-forest-300/90 text-xs">
                        ${escapeXml(tip.detail)}
                    </p>
                </div>
            `;
        });
        html += '</div>';
    }

    // Render formatted SQL output block
    html += `
        <div class="mt-3 p-3 rounded-lg bg-forest-950/50 border border-earth-borderDark/50">
            <div class="text-xs font-semibold text-earth-textDark mb-2">
                Refined Query
            </div>
            <pre class="text-xs text-emerald-300 font-mono whitespace-pre-wrap overflow-x-auto bg-black/30 p-2.5 rounded border border-earth-borderDark/40">${escapeXml(refinedQuery || cleanSql)}</pre>
            <div class="text-[10px] text-forest-400 mt-2">
                Formatted only — not execution-tested.
            </div>
        </div>
    `;

    container.innerHTML = html;
}
