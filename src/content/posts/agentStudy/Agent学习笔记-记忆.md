---
title: Agent学习笔记-记忆模块
published: 2026-07-10
pinned: false
description: 记录学习Agent的记忆模块和上下文工程的相关知识点、以HelloAgent为案例
tags:
  - Agent
  - Rag
category: Agent
draft: false
---
# 认知科学与智能体记忆

三种记忆类型：

| 记忆类型    | 存储内容                                                                   | 何时读写                    |
| ------- | ---------------------------------------------------------------------- | ----------------------- |
| 短期/工作记忆 | 当前对话历史，确保被高速访问和响应                                                      | 每轮读写，单次会话内有效            |
| 长期记忆    | 用户偏好、长期事实、知识库；，通过对话了解到的用户偏好、需要长期遵守的指令或领域知识点，都适合存放在这里。                  | 读：每次相关query；写：用户表达相关意图时 |
| 情景记忆    | 长期存储具体的交互事件和智能体的学习经历；包含了丰富的上下文信息，并支持按时间序列或主题进行回顾式检索，是智能体“复盘”和学习过往经验的基础 | 读：相似场景；写：每次对话结束         |
Hello Agent中引入感知记忆，负责存储图片、音视频等多模态信息


# 记忆系统
## 工作流程
Hello Agent中的记忆系统工作流程：
![](../images/Pasted%20image%2020260710201150.png)
**操作类型分为三种：**
1. 添加记忆
	* 基于内存和ttl管理的短期记忆
	* SQLite+向量数据库的情景记忆
	* 知识图谱+向量数据库的长期记忆
	* SQLite+向量数据库的多模态记忆

2. 搜索记忆：rag

3. 管理记忆
	* 记忆整合（摘要）
	* 遗忘策略
	* 统计分析


## memory tool
业务流程中通过memory tool实现对记忆的管理
```
def execute(self, action: str, **kwargs) -> str:
    """执行记忆操作

    支持的操作：
    - add: 添加记忆（支持4种类型: working/episodic/semantic/perceptual）
    - search: 搜索记忆
    - summary: 获取记忆摘要
    - stats: 获取统计信息
    - update: 更新记忆
    - remove: 删除记忆
    - forget: 遗忘记忆（多种策略）
    - consolidate: 整合记忆（短期→长期）
    - clear_all: 清空所有记忆
    """

    if action == "add":
        return self._add_memory(**kwargs)
    elif action == "search":
        return self._search_memory(**kwargs)
    elif action == "summary":
        return self._get_summary(**kwargs)
    # ... 其他操作
```

添加操作
```
def _add_memory(
    self,
    content: str = "",
    memory_type: str = "working",
    importance: float = 0.5,
    file_path: str = None,
    modality: str = None,
    **metadata
) -> str:
    """添加记忆"""
    try:
		# 添加记忆操作

    except Exception as e:
        return f"❌ 添加记忆失败: {str(e)}"
```
三个关键任务：
* 会话ID的自动管理（确保每个记忆都有明确的会话归属）
* 多模态数据的智能处理（自动推断文件类型并保存相关元数据，不同记忆类型具体识别具体存储）
* 上下文信息的自动补充（为每个记忆添加时间戳和会话信息）

其中，`importance`参数（默认0.5）用于标记记忆的重要程度，取值范围0.0-1.0，这个机制模拟了人类大脑对不同信息重要性的评估。这种设计让Agent能够自动区分不同时间段的对话，并为后续的检索和管理提供丰富的上下文信息。


检索操作
```
def _search_memory(
    self,
    query: str,
    limit: int = 5,
    memory_types: List[str] = None,
    memory_type: str = None,
    min_importance: float = 0.1
) -> str:
    """搜索记忆"""
    try:
        # 参数标准化处理
        if memory_type and not memory_types:
            memory_types = [memory_type]

        results = self.memory_manager.retrieve_memories(
            query=query,
            limit=limit,
            memory_types=memory_types,
            min_importance=min_importance
        )

        # 减速以及结果处理

        return "\n".join(formatted_results)

    except Exception as e:
        return f"❌ 搜索记忆失败: {str(e)}"
```


遗忘操作
```
def _forget(self, strategy: str = "importance_based", threshold: float = 0.1, max_age_days: int = 30) -> str:
    """遗忘记忆（支持多种策略）"""
    try:
        count = self.memory_manager.forget_memories(
            strategy=strategy,
            threshold=threshold,
            max_age_days=max_age_days
        )
        return f"🧹 已遗忘 {count} 条记忆（策略: {strategy}）"
    except Exception as e:
        return f"❌ 遗忘记忆失败: {str(e)}"
```
模拟人类大脑的选择性遗忘过程，支持三种策略：基于重要性（删除不重要的记忆）、基于时间（删除过时的记忆）和基于容量（当存储接近上限时删除最不重要的记忆）。
```
# 1. 基于重要性的遗忘 - 删除重要性低于阈值的记忆
memory_tool.execute("forget",
    strategy="importance_based",
    threshold=0.2
)

# 2. 基于时间的遗忘 - 删除超过指定天数的记忆
memory_tool.execute("forget",
    strategy="time_based",
    max_age_days=30
)

# 3. 基于容量的遗忘 - 当记忆数量超限时删除最不重要的
memory_tool.execute("forget",
    strategy="capacity_based",
    threshold=0.3
)
```

合并操作

```
def _consolidate(self, from_type: str = "working", to_type: str = "episodic", importance_threshold: float = 0.7) -> str:
    """整合记忆（将重要的短期记忆提升为长期记忆）"""
    try:
        count = self.memory_manager.consolidate_memories(
            from_type=from_type,
            to_type=to_type,
            importance_threshold=importance_threshold,
        )
        return f"🔄 已整合 {count} 条记忆为长期记忆（{from_type} → {to_type}，阈值={importance_threshold}）"
    except Exception as e:
        return f"❌ 整合记忆失败: {str(e)}"
```
consolidate操作借鉴了神经科学中的记忆固化概念，模拟人类大脑将短期记忆转化为长期记忆的过程。默认设置是将重要性超过0.7的工作记忆转换为情景记忆，这个阈值确保只有真正重要的信息才会被长期保存。整个过程是自动化的，用户无需手动选择具体的记忆，系统会智能地识别符合条件的记忆并执行类型转换。


## memory manager
在底层与memory tool协作，分层设计体现了软件工程中的关注点分离原则，MemoryTool专注于用户接口和参数处理，而MemoryManager则负责核心的记忆管理逻辑。

MemoryTool在初始化时会创建一个MemoryManager实例，并根据配置启用不同类型的记忆模块。

**MemoryManager作为记忆系统的核心协调者，负责管理不同类型的记忆模块，并提供统一的操作接口。**
首先初始化各种记忆类的的存储、检索组件、配置等

针对四种记忆类型，实现各种记忆类型的

1. 工作记忆（WorkingMemory）

	>工作记忆是记忆系统中最活跃的部分，它负责存储当前对话会话中的临时信息。工作记忆的设计重点在于快速访问和自动清理，这种设计确保了系统的响应速度和资源效率。
	
	工作记忆采用了纯内存**存储**方案，配合TTL（Time To Live）机制进行自动清理。这种设计的优势在于访问速度极快，但也意味着工作记忆的内容在系统重启后会丢失。这种特性正好符合工作记忆的定位，存储临时的、易变的信息。
	工作记忆的**检索**采用了混合检索策略，首先尝试使用TF-IDF向量化进行语义检索，如果失败则回退到关键词匹配。这种设计确保了在各种环境下都能提供可靠的检索服务。评分算法结合了语义相似度、时间衰减和重要性权重，最终得分公式为：`(相似度 × 时间衰减) × (0.8 + 重要性 × 0.4)`。


2. 情景记忆（EpisodicMemory）
	>情景记忆负责存储具体的事件和经历，它的设计重点在于保持事件的完整性和时间序列关系。
	
	情景记忆采用了SQLite+Qdrant的混合**存储**方案，SQLite负责结构化数据的存储和复杂查询，Qdrant负责高效的向量检索。
	情景记忆的**检索**实现展现了复杂的多因素评分机制。它不仅考虑了语义相似度，还加入了时间近因性的考量，最终通过重要性权重进行调节。评分公式为：`(向量相似度 × 0.8 + 时间近因性 × 0.2) × (0.8 + 重要性 × 0.4)`，确保检索结果既语义相关又时间相关。

3. 语义记忆（SemanticMemory）
	 语义记忆是记忆系统中最复杂的部分，它负责存储抽象的概念、规则和知识。语义记忆的设计重点在于知识的结构化表示和智能推理能力。语义记忆采用了Neo4j图数据库和Qdrant向量数据库的混合架构，这种设计让系统既能进行快速的语义检索，又能利用知识图谱进行复杂的关系推理。
	
	添加记忆时执行知识图谱的完整构建流程、以及向量化存储
	
	检索实现了混合搜索策略，结合了向量检索的语义理解能力和图检索的关系推理能力
	
	混合排序算法采用了多因素评分机制：语义记忆的评分公式为：`(向量相似度 × 0.7 + 图相似度 × 0.3) × (0.8 + 重要性 × 0.4)`。这种设计的核心思想是：

	- **向量检索权重（0.7）**：语义相似度是主要因素，确保检索结果与查询语义相关
	- **图检索权重（0.3）**：关系推理作为补充，发现概念间的隐含关联
	- **重要性权重范围[0.8, 1.2]**：避免重要性过度影响相似度排序，保持检索的准确性

3. 感知记忆（PerceptualMemory）
	感知记忆支持文本、图像、音频等多种模态的数据存储和检索。它采用了模态分离的存储策略，为不同模态的数据创建独立的向量集合，这种设计避免了维度不匹配的问题，同时保证了检索的准确性
	
	感知记忆的检索支持同模态和跨模态两种模式。同模态检索利用专业的编码器进行精确匹配，而跨模态检索则需要更复杂的语义对齐机制