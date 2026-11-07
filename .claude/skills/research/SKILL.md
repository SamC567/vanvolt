---
name: research
description: Research a product specification, electrical standard, formula or library API from primary sources and return facts with source URLs and verification status (document/secondary/derived). Use before adding or changing any electrical data in VanVolt.
argument-hint: <question, product or topic>
context: fork
agent: researcher
---

Research this for VanVolt: **$ARGUMENTS**

1. Restate exactly which facts are needed (values, units, conditions) before searching.
2. Find the manufacturer's own datasheet/manual, the standard, or official docs. Use search
   results only to locate the primary document.
3. Download and read the document to confirm each value (see your agent instructions).
   Record the model column and test condition for every figure.
4. If VanVolt already holds this data (`packages/engine/src/data/`), compare and list any
   differences as `current → document`.
5. Return the report format from your instructions. If nothing could be verified, say so
   plainly — never fill gaps from memory.
