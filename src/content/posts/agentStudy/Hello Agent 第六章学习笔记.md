---
title: Hello Agent第六章学习笔记
published: 2026-07-10
pinned: false
description: 学习Hello Agent中第六章的内容，包括为什么需要框架，以及当前常用框架的介绍与区别
tags:
  - Agent
category: Agent
draft: false
---
# 为何需要框架
>Agent框架本质：它将所有智能体共有的、重复性的工作（如主循环、状态管理、工具调用、日志记录等）进行抽象和封装，让我们在构建新的智能体时，能够专注于其独特的业务逻辑，而非通用的底层实现。

框架价值的体现：
1. **提升代码复用**：提供通用的agent基类，或者执行器；将封装好的内容直接提供进行使用，无论是ReAct还是Plan-and-Excuteed。
2. **实现agent的解耦**：
	1. 模型层：负责大语言模型的交互、调用、路由、调度等
	2. 工具层：mcp、tools，可以随意扩展新的工具而不影响已有代码
	3. 记忆层：负责处理短期记忆、长期记忆；以及各种记忆策略（滑动窗口、摘要等）
3. **标准化复杂的状态管理**：使用状态管理的方式来辅助流程的处理，包括会话、上下文等，而不是一味地使用大量的if...else...等语句来实现业务流程
4. **简化可观测性与调试过程**：引入回调机制或者类似java aop切面编程的思想的方式，来实现日志、数据上报、链路监控等
# 主流框架对比
![](../images/Pasted%20image%2020260710105057.png)
* **AutoGen**：基于**对话驱动**的协作框架。将多智能体系统抽象为**可对话智能体群组**，通过**角色定义**与**交互规则配置**，以**自动化消息传递**驱动多轮协作迭代，直至任务完成。
    
- **AgentScope**：强调**易用性**与**工程化**，提供标准化编程接口，覆盖智能体定义、通信网络构建及应用生命周期管理。内置**消息传递机制**与**分布式部署**能力，适用于大规模复杂系统的开发与运维。智能体之间通过**消息**通信，而非函数调用
    
- **CAMEL**：基于**角色扮演**的协作范式。通过为智能体分配角色与共同目标，结合**初始提示**引导，实现自主多轮对话与协同推理，显著降低多智能体对话流程的设计复杂度。
    
- **LangGraph**：基于**图结构**的智能体执行框架。将执行流程建模为**节点**（操作单元）与**边**（跳转逻辑）构成的有向图，天然支持**循环**与**分支**，适合实现迭代修正、自我反思等复杂工作流。

# 主流框架学习
## AutoGen
### 设计
**分层设计**：拆分为两个核心模块
- `autogen-core`：作为框架的底层基础，封装了与语言模型交互、消息传递等核心功能。它的存在保证了框架的稳定性和未来扩展性。
- `autogen-agentchat`：构建于 `core` 之上，提供了用于开发对话式智能体应用的高级接口，简化了多智能体应用的开发流程。 这种分层策略使得各组件职责明确，降低了系统的耦合度。
**异步优先**：在多智能体协作场景中，网络请求（如调用 LLM API）是主要耗时操作。异步模式提升了并发处理能力和系统资源的利用效率。
--------
### 核心智能体组件
- **AssistantAgent (助理智能体)：** 
	- 这是任务的主要解决者，其核心是封装了一个大型语言模型（LLM）。
	- 它的职责是根据对话历史生成富有逻辑和知识的回复，例如提出计划、撰写文章或编写代码。通过不同的系统消息（System Message），我们可以为其赋予不同的“专家”角色。
- **UserProxyAgent (用户代理智能体)：** 这是 AutoGen 中功能独特的组件。
	- 它扮演着双重角色：既是人类用户的“代言人”，负责发起任务和传达意图；
	* 又是一个可靠的“执行器”，可以配置为执行代码或调用工具，并将结果反馈给其他智能体。
	* 这种设计清晰地区分了“思考”（由 `AssistantAgent` 完成）与“行动”。

### 对话机制
- **轮询群聊 (RoundRobinGroupChat)：** 这是一种明确的、顺序化的对话协调机制。让参与的智能体按照预定义的顺序依次发言。这种模式非常适用于流程固定的任务，例如一个典型的软件开发流程：产品经理先提出需求，然后工程师编写代码，最后由代码审查员进行检查。
- **工作流：**
    1. 首先，创建一个 `RoundRobinGroupChat` 实例，并将所有参与协作的智能体（如产品经理、工程师等）加入其中。
    2. 当一个任务开始时，群聊会按照预设的顺序，依次激活相应的智能体。
    3. 被选中的智能体根据当前的对话上下文进行响应。
    4. 群聊将新的回复加入对话历史，并激活下一个智能体。
    5. 这个过程会持续进行，直到达到最大对话轮次或满足预设的终止条件。

通过这种方式，AutoGen 将复杂的协作关系，简化为一个流程清晰、易于管理的自动化“圆桌会议”。开发者只需定义好每个团队成员的角色和发言顺序，剩下的协作流程便可由群聊机制自主驱动。

## AgentScope
与 AutoGen 相比，AgentScope 的核心差异在于其**消息驱动的架构设计**和**工业级的工程实践**。
AgentScope 选择了**组合式架构**和**消息驱动模式**。这种设计增强了系统的模块化程度。

### 分层架构体系：
![694](../images/Pasted%20image%2020260710111338.png)
 第一层：地基 —— 基础组件层（Foundational Components）
-Message（统一消息格式）
- Memory（记忆管理）
- Model API（模型调用层）
- Tool（工具封装）

 第二层：躯干 —— 智能体基础设施层（Agent-level Infrastructure）
- **内置智能体（Built-in Agents）**：框架直接给你几个“半成品”Agent，比如能操作浏览器的、能做深度研究的、能做复杂任务规划的。你可以直接拿来用，或者二次改造。
    
- **ReAct 范式实现**：这是让 Agent “边想边做”的核心机制。框架帮你把“推理（Reason）”和“行动（Act）”的循环流程写好了，并额外支持：
    - 钩子（Hooks）
    - 并行调用工具：Agent 一次可以同时调用多个工具，提高效率。
    - 结构化输出：强制 Agent 按指定格式（如 JSON）输出，方便程序解析。
    - 状态/会话管理：统一管理 Agent 的内部状态，解决你之前关心的“状态持久化”问题。
    - 异步执行与实时控制：支持 Agent 在后台“边跑边等”，并且你可以在运行中“插手”调整它的方向（这是 AgentScope 的一大亮点）。


第三层：协作网 —— 多智能体协作层（Multi-Agent Cooperation）
解决“多个 Agent 怎么配合干活”：
- **MsgHub（消息中心）**：相当于一个“邮局”，负责所有 Agent 之间的消息转发、路由和状态同步。Agent 们不用互相知道对方地址，只跟 MsgHub 打交道就行。
    
- **Pipeline（工作流管道）**：提供“流水线”编排能力。你可以设定 Agent 们是按顺序干（串行）、还是一起干（并行）、或者更复杂的模式。这让你能把多个 Agent 组织成一个高效的“流水线工厂”。

第四层：交付与运维 —— 开发与部署层（Development & Deployment）
这一层负责“从写代码到上线

### 消息驱动
AgentScope 的核心创新在于其**消息驱动架构**。在这个架构中，所有的智能体交互都被抽象为**消息**的发送和接收，而不是传统的函数调用。

```
from agentscope.message import Msg

# 消息的标准结构
message = Msg(
    name="Alice",           # 发送者名称
    content="Hello, Bob!",  # 消息内容
    role="user",           # 角色类型
    metadata={             # 元数据信息
        "timestamp": "2024-01-15T10:30:00Z",
        "message_type": "text",
        "priority": "normal"
    }
)
```

将消息作为交互的基础单元，带来了几个关键优势：

- **异步解耦**: 消息的发送方和接收方在时间上解耦，无需相互等待，天然支持高并发场景。
- **位置透明**: 智能体无需关心另一个智能体是在本地进程还是在远程服务器上，消息系统会自动处理路由。
- **可观测性**: 每一条消息都可以被记录、追踪和分析，极大地简化了复杂系统的调试与监控。

### 智能体生命周期管理
在 AgentScope 中，每个智能体都有明确的生命周期（初始化、运行、暂停、销毁等），并基于一个统一的基类 `AgentBase` 来实现。开发者通常只需要关注其核心的 `reply` 方法。

```
from agentscope.agents import AgentBase

class CustomAgent(AgentBase):
    def __init__(self, name: str, **kwargs):
        super().__init__(name=name, **kwargs)
        # 智能体初始化逻辑
    
    def reply(self, x: Msg) -> Msg:
        # 智能体的核心响应逻辑
        response = self.model(x.content)
        return Msg(name=self.name, content=response, role="assistant")
    
    def observe(self, x: Msg) -> None:
        # 智能体的观察逻辑（可选）
        self.memory.add(x)
```

### 消息传递机制
AgentScope 内置了一个**消息中心 (MsgHub)**，它是整个消息驱动架构的中枢。


## LangGraph
LangGraph 将智能体的执行流程建模为一种**状态机**，并将其表示为**有向图**。在这种范式中，图的**节点**代表一个具体的计算步骤（如调用 LLM、执行工具），而**边（Edges)** 则定义了从一个节点到另一个节点的跳转逻辑。

这种设计的革命性之处在于它天然支持循环，使得构建能够进行迭代、反思和自我修正的复杂智能体工作流变得前所未有的直观和简单。

### 全局状态（State）
整个图的执行过程都围绕一个共享的状态对象进行。所有的节点都能读取和更新这个中心状态。

```
from typing import TypedDict, List

# 定义全局状态的数据结构
class AgentState(TypedDict):
    messages: List[str]      # 对话历史
    current_task: str        # 当前任务
    final_answer: str        # 最终答案
    # ... 任何其他需要追踪的状态
```

### 节点（Nodes）
每个节点都是一个接收当前状态作为输入、并返回一个更新后的状态作为输出的 Python 函数。节点是执行具体工作的单元。

```
# 定义一个“规划者”节点函数
def planner_node(state: AgentState) -> AgentState:
    """根据当前任务制定计划，并更新状态。"""
    current_task = state["current_task"]
    # ... 调用LLM生成计划 ...
    plan = f"为任务 '{current_task}' 生成的计划..."
    
    # 将新消息追加到状态中
    state["messages"].append(plan)
    return state

# 定义一个“执行者”节点函数
def executor_node(state: AgentState) -> AgentState:
    """执行最新计划，并更新状态。"""
    latest_plan = state["messages"][-1]
    # ... 执行计划并获得结果 ...
    result = f"执行计划 '{latest_plan}' 的结果..."
    
    state["messages"].append(result)
    return state
```

### 边（Edges）
边负责连接节点，定义工作流的方向。最简单的边是常规边，它指定了一个节点的输出总是流向另一个固定的节点。而 LangGraph 最强大的功能在于**条件边**。它通过一个函数来判断当前的状态，然后动态地决定下一步应该跳转到哪个节点。这正是实现循环和复杂逻辑分支的关键。

```
def should_continue(state: AgentState) -> str:
    """条件函数：根据状态决定下一步路由。"""
    # 假设如果消息少于3条，则需要继续规划
    if len(state["messages"]) < 3:
        # 返回的字符串需要与添加条件边时定义的键匹配
        return "continue_to_planner"
    else:
        state["final_answer"] = state["messages"][-1]
        return "end_workflow"
```

在定义了状态、节点和边之后，我们可以像搭积木一样将它们组装成一个可执行的工作流。

```
from langgraph.graph import StateGraph, END

# 初始化一个状态图，并绑定我们定义的状态结构
workflow = StateGraph(AgentState)

# 将节点函数添加到图中
workflow.add_node("planner", planner_node)
workflow.add_node("executor", executor_node)

# 设置图的入口点
workflow.set_entry_point("planner")

# 添加常规边，连接 planner 和 executor
workflow.add_edge("planner", "executor")

# 添加条件边，实现动态路由
workflow.add_conditional_edges(
    # 起始节点
    "executor",
    # 判断函数
    should_continue,
    # 路由映射：将判断函数的返回值映射到目标节点
    {
        "continue_to_planner": "planner", # 如果返回"continue_to_planner"，则跳回planner节点
        "end_workflow": END               # 如果返回"end_workflow"，则结束流程
    }
)

# 编译图，生成可执行的应用
app = workflow.compile()

# 运行图
inputs = {"current_task": "分析最近的AI行业新闻", "messages": []}
for event in app.stream(inputs):
    print(event)
```