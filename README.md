# QueryLens
SQL query visualizer that helps analyze query logic, data flow, joins, grain, and potential performance issues.

I suck at visualizing SQL execution order.

So I built something to fix it!

When I started learning SQL (who am I kidding, I'm still learning — there's a ton I don't know), I kept hitting the same wall:

**Mental Execution Flow.**

It's easy to write a query.

It's significantly harder to visualize how the database processes:

`FROM → WHERE → GROUP BY → HAVING → SELECT`

...or spot subtle logic traps before they break something in production.

I wanted a visual tool that breaks down SQL execution order, inspects query logic, and offers optimization suggestions without giving me generic, dry explanations.

So, I'm building **Query Lens**.

##  What It Does

### 1. Execution & Logical Flow Diagrams

Visualizes SQL's logical execution order and helps you understand what happens at each stage.

### 2. Query Diagnostics & Logic Inspection

Highlights common SQL traps, including:

- `LEFT JOIN` filters accidentally behaving like `INNER JOIN`
- `AND/OR` precedence mistakes
- Potential row multiplication through joins
- Aggregation and grouping concerns
- Common SQL syntax issues

### 3. Optimization & Performance Suggestions (β)

Provides plain-English recommendations for writing cleaner and potentially faster queries.

The suggestions are written in my style — direct, practical, and with zero generic corporate speak.

**Important:** This feature is still in beta. It currently uses rule-based checks and suggestions, and I plan to integrate AI to make the analysis more advanced and context-aware.

There's always a catch! (Aishhhhh...)

##  How It's Built

I'm an analyst, not a full-stack web developer.

Yes, I used AI to help construct the frontend. But the diagnostic engine, explanations, and rules are built around my own logic, learning, and way of thinking.

The goal is to make SQL concepts easier to understand through:

- Visual explanations
- Practical examples
- Data-grain awareness
- Join and aggregation analysis
- Straightforward feedback

No unnecessary corporate language. NO-BS.

## The Design

It's wrapped in a dark forest theme because...

Well, I like this color.

So... **Why Not!!!**

## Why I Built This

I'm building Query Lens while learning SQL myself.

I don't know everything. I'm still figuring things out, making mistakes, and discovering how much there is to learn.

This project is part of that process.

It's currently **free, ad-free, and built for the community.**

## Help Me Break It

Query Lens is currently under development, and I NEED PEOPLE TO BREAK IT.

If you write SQL daily or are currently learning SQL, I'd love your help testing it.

Try throwing difficult queries at it.

Try breaking the logic.

Find edge cases.

Tell me when the explanations don't make sense.

Point out when the tool gets something wrong.

That's how this project gets better.

## Future Plans

- Improve SQL parsing and diagnostics
- Make explanations more context-aware
- Add AI-powered optimization suggestions
- Improve execution-flow visualization
- Support more complex SQL queries
- Add more edge-case detection

## ⚠️ Current Limitations

Query Lens is a learning and inspection tool, not a full SQL execution engine.

The optimization suggestions are heuristic-based and should be reviewed against your database's execution plan, schema, and actual performance measurements.

**Don't blindly trust the suggestions. Validate them.**

## Contributing & Feedback

Found a bug? Have a better idea? Got a query that breaks the tool?

Feel free to open an issue or share your feedback.

I'd rather you break it now than let it confidently give someone the wrong answer later.

---

I'll keep you updated about this little project of mine.

Hope you keep Query Lens warm for me, hehe. 💚
