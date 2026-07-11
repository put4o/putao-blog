---
title: Agent学习笔记-rag&HelloAgent
published: 2026-07-11
pinned: false
description: 学习HelloAgent中第八章内容的RAG部分，同时记录RAG中的重要知识点
tags:
  - Agent
  - Rag
category: Agent
draft: false
---
# RAG相关知识点
rag一般流程：
![](../images/Pasted%20image%2020260711113641.png)

Chunking策略

| 策略      | 说明                 | 推荐                  |
| ------- | ------------------ | ------------------- |
| 固定长度    | 每N token切一刀        | 简单场景，512-1024tokens |
| 语义切分    | 按段落/标题/句号切         | 结构化文档（首选）           |
| 层级Chunk | 同时存大块+小块，先small再扩展 | 长文档                 |
| 重叠      | 相邻chunk重叠10-20%    | 避免边界丢信息             |

检索策略
* 纯向量：语义召回好，关键词召回差
* 混合检索（hybird）：向量+BM25各召回一批，融合排序（生产环境推荐）
* 重拍（rerank）：先粗召回50-100，再用cross-encoder精排top-10
* query扩展：让llm改写多个变体再检索4
* HyDe：先让LLM生成“假设答案”，用答案去进行向量相似度检索

测评指标
Recall：召回率，答案被召回了多少
precision：召回的chunk中多少是相关的
mmr：第一个正确答案在第几位出现
ndcg：找到的答案是否被排在靠前的位置
answer faithfulness：最终答案是否忠实于检索内容

# Hello Agent的rag系统
整个系统主要有两个工作流程
* **数据处理流程**：处理和存储知识文档，在这里我们采取工具`Markitdown`，设计思路是将传入的一切外部知识源统一转化为Markdown格式进行处理。
* **查询与生成流程**：根据查询检索相关信息并生成回答。

## 系统设计
```
用户层：RAGTool统一接口
  ↓
应用层：智能问答、搜索、管理
  ↓  
处理层：文档解析、分块、向量化
  ↓
存储层：向量数据库、文档存储
  ↓
基础层：嵌入模型、LLM、数据库
```

### RagTool作为Rag系统的统一入口
#### 初始化
```
class RAGTool(Tool):
    """RAG工具
    
    提供完整的 RAG 能力：
    - 添加多格式文档（PDF、Office、图片、音频等）
    - 智能检索与召回
    - LLM 增强问答
    - 知识库管理
    """
    
    def __init__(
        self,
        knowledge_base_path: str = "./knowledge_base",
        qdrant_url: str = None,
        qdrant_api_key: str = None,
        collection_name: str = "rag_knowledge_base",
        rag_namespace: str = "default"
    ):
        # 初始化RAG管道
        # 创建默认管道


```

#### 1. 多模态文档载入
	RAG系统的核心优势之一是其强大的多模态文档处理能力。系统使用MarkItDown作为统一的文档转换引擎，支持几乎所有常见的文档格式。
	MarkItDown，负责将任意格式的文档统一转换为结构化的Markdown文本。将PDF、Word、Excel、图片还是音频，转换为标准的Markdown格式，然后进入统一的分块、向量化和存储流程。

#### 2. 智能分块策略
	经过MarkItDown转换后，所有文档都统一为标准的Markdown格式。


	由于所有文档都已转换为Markdown格式，系统可以利用Markdown的标题结构（#、##、###等）进行精确的语义分割


	在Markdown段落分割的基础上，系统进一步根据Token数量进行智能分块。由于输入已经是结构化的Markdown文本，系统可以更精确地控制分块边界，确保每个分块既适合向量化处理，又保持Markdown结构的完整性

```
标准Markdown文本 → 标题层次解析 → 段落语义分割 → Token计算分块 → 重叠策略优化 → 向量化准备
       ↓                ↓              ↓            ↓           ↓            ↓
   统一格式          #/##/###        语义边界      大小控制     信息连续性    嵌入向量
   结构清晰          层次识别        完整性保证    检索优化     上下文保持    相似度匹配
```


1. **输入参数**
```python
paragraphs: List[Dict]  # 已经切分好的段落列表，每个段落有content、start、end等
chunk_tokens: int       # 每个块的最大Token数（如512）
overlap_tokens: int     # 块与块之间的重叠Token数（如50）
```

2. **贪心累积策略**
```python
while i < len(paragraphs):
    p = paragraphs[i]
    p_tokens = _approx_token_len(p["content"]) or 1
    
    # 关键判断：如果加入当前段落不超过限制，或者当前块为空
    if cur_tokens + p_tokens <= chunk_tokens or not cur:
        cur.append(p)      # 添加段落
        cur_tokens += p_tokens
        i += 1             # 移动到下一个段落
    else:
        # 当前块已满，保存并创建新块
        save_current_chunk()
        # 处理重叠逻辑...
```
**关键点**：
- **贪心策略**：尽可能多地塞入段落，直到塞不下为止
- **段落完整性**：以段落为单位，**不会切断一个段落**（除非段落本身就超长）
- **特殊处理**：`or not cur` 确保即使段落超长，也至少包含一个段落
    

3. **重叠（Overlap）机制**
```python
if overlap_tokens > 0 and cur:
    kept: List[Dict] = []
    kept_tokens = 0
    
    # 从当前块末尾往前取段落
    for x in reversed(cur):
        t = _approx_token_len(x["content"]) or 1
        if kept_tokens + t > overlap_tokens:
            break
        kept.append(x)
        kept_tokens += t
    
    # 反转回来，保持原始顺序
    cur = list(reversed(kept))
    cur_tokens = kept_tokens
```
**工作原理**：
- 保存当前块后，从末尾开始往前取段落
- 累加Token数，直到达到`overlap_tokens`限制
- 这些段落会**作为下一个块的起始部分**
    

4. **保存分块**
```python
content = "\n\n".join(x["content"] for x in cur)  # 用双换行连接
start = cur[0]["start"]      # 块的起始位置
end = cur[-1]["end"]         # 块的结束位置
```
找到最后一个有标题路径的段落（用于上下文）
```python
heading_path = next((x["heading_path"] for x in reversed(cur) if x.get("heading_path")), None)
chunks.append({
    "content": content,
    "start": start,
    "end": end,
    "heading_path": heading_path,  # 保留层级结构信息
})
```

#### 3. 统一嵌入与向量存储
嵌入模型是RAG系统的核心，它负责将文本转换为高维向量，使得计算机能够理解和比较文本的语义相似性。RAG系统的检索能力很大程度上取决于嵌入模型的质量和向量存储的效率。HelloAgents实现了统一的嵌入接口。

## 检索
RAG系统的检索能力是其核心竞争力。在实际应用中，用户的查询表述与文档中的实际内容可能存在用词差异，导致相关文档无法被检索到。为了解决这个问题，HelloAgents实现了三种互补的高级检索策略：多查询扩展（MQE）、假设文档嵌入（HyDE）和统一的扩展检索框架。

（1）多查询扩展（MQE）
多查询扩展（Multi-Query Expansion）是一种通过生成语义等价的多样化查询来提高检索召回率的技术。

MQE的优势在于它能够自动理解用户查询的多种可能含义，特别是对于模糊查询或专业术语查询效果显著。系统使用LLM生成扩展查询，确保扩展的多样性和语义相关性

```python
def _prompt_mqe(query: str, n: int) -> List[str]:
    """使用LLM生成多样化的查询扩展"""
    try:
        from ...core.llm import HelloAgentsLLM
        llm = HelloAgentsLLM()
        prompt = [
            {"role": "system", "content": "你是检索查询扩展助手。生成语义等价或互补的多样化查询。使用中文，简短，避免标点。"},
            {"role": "user", "content": f"原始查询：{query}\n请给出{n}个不同表述的查询，每行一个。"}
        ]
        text = llm.invoke(prompt)
        lines = [ln.strip("- \t") for ln in (text or "").splitlines()]
        outs = [ln for ln in lines if ln]
        return outs[:n] or [query]
    except Exception:
        return [query]
```


（2）假设文档嵌入（HyDE）

假设文档嵌入（Hypothetical Document Embeddings，HyDE）是一种创新的检索技术，它的核心思想是"用答案找答案"。

这种方法的优势在于，假设答案与真实答案在语义空间中更加接近，因此能够更准确地匹配到相关文档。即使假设答案的内容不完全正确，它所包含的关键术语、概念和表述风格也能有效引导检索系统找到正确的文档。
```python
def _prompt_hyde(query: str) -> Optional[str]:
    """生成假设性文档用于改善检索"""
    try:
        from ...core.llm import HelloAgentsLLM
        llm = HelloAgentsLLM()
        prompt = [
            {"role": "system", "content": "根据用户问题，先写一段可能的答案性段落，用于向量检索的查询文档（不要分析过程）。"},
            {"role": "user", "content": f"问题：{query}\n请直接写一段中等长度、客观、包含关键术语的段落。"}
        ]
        return llm.invoke(prompt)
    except Exception:
        return None
```


（3）扩展检索框架

HelloAgents将MQE和HyDE两种策略整合到统一的扩展检索框架中。系统通过`enable_mqe`和`enable_hyde`参数让用户可以根据具体场景选择启用哪些策略：对于需要高召回率的场景可以同时启用两种策略，对于性能敏感的场景可以只使用基础检索。

扩展检索的核心机制是"扩展-检索-合并"三步流程。首先，系统根据原始查询生成多个扩展查询（包括MQE生成的多样化查询和HyDE生成的假设文档）；然后，对每个扩展查询并行执行向量检索，获取候选文档池；最后，通过去重和分数排序合并所有结果，返回最相关的top-k文档。这种设计的巧妙之处在于，它通过`candidate_pool_multiplier`参数（默认为4）扩大候选池，确保有足够的候选文档进行筛选，同时通过智能去重避免返回重复内容。
```python
def search_vectors_expanded(
	#参数
) -> List[Dict]:
    """
    Search with query expansion using unified embedding and Qdrant.
    """
    if not query:
        return []
    
    # 创建默认存储

    
    # 查询扩展
    expansions: List[str] = [query]
    
    if enable_mqe and mqe_expansions > 0:
        expansions.extend(_prompt_mqe(query, mqe_expansions))
    if enable_hyde:
        hyde_text = _prompt_hyde(query)
        if hyde_text:
            expansions.append(hyde_text)

    # 去重和修剪
    uniq: List[str] = []
    for e in expansions:
        if e and e not in uniq:
            uniq.append(e)
    expansions = uniq[: max(1, len(uniq))]

    # 分配候选池

    # 构建RAG数据过滤器

    # 收集所有扩展查询的结果
    
    # 按分数排序返回
    merged = list(agg.values())
    merged.sort(key=lambda x: float(x.get("score", 0.0)), reverse=True)
    return merged[:top_k]
```