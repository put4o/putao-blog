---
title: Hello Agent第七章学习笔记
published: 2026-07-10
pinned: false
description: 本章讲解了如何构建自己的Agent，需要什么模块，什么组件，什么接口；从而深入学习到一个Agent的构成与工作原理
tags:
  - Agent
category: Agent
draft: false
---
# 第七章学习地图
## 手搓框架的目的
1. 市面框架的快速迭代与局限性
	- 过度抽象的复杂性：许多框架为了追求通用性，引入了大量抽象层和配置选项。
	- 快速迭代带来的不稳定性：开发者经常面临版本升级后代码无法运行的困扰，维护成本居高不下。
	- 黑盒化的实现逻辑：遇到问题时只能依赖文档和社区支持，尤其是如果社区不够活跃，可能一个反馈意见会非常久也没有人推进，影响后续的开发效率。
	- 依赖关系的复杂性：成熟框架往往携带大量依赖包，安装包体积庞大，在需要与别的项目代码配合使用可能出现依赖冲突问题。

2. **从使用者到构建者的能力跃迁**（成为Agent工程师的必由之路）
	- **深度理解Agent工作原理**：通过亲手实现每个组件，开发者能够真正理解Agent的思考过程、工具调用机制、以及各种设计模式的好坏与区别。
	- **获得完全的控制权**：自建框架意味着对每一行代码都有完全的掌控，可以根据具体需求进行精确调优，而不受第三方框架设计理念的束缚。
	- **培养系统设计能力**：框架构建过程涉及模块化设计、接口抽象、错误处理等软件工程核心技能，这些能力对开发者的长期成长具有重要价值。

3. 定制化需求与深度掌握的必要性
	 - **特定领域的优化需求**：金融、医疗、教育等垂直领域往往需要针对性的提示词模板、特殊的工具集成、以及定制化的安全策略。
	- **性能与资源的精确控制**：生产环境中，对响应时间、内存占用、并发处理能力都有严格要求，通用框架的"一刀切"方案往往无法满足精细化需求。

## Hello Agent目录结构与学习内容

```
hello-agents/
├── hello_agents/
│   │
│   ├── core/                     # 核心框架层
│   │   ├── agent.py              # Agent基类
│   │   ├── llm.py                # HelloAgentsLLM统一接口
│   │   ├── message.py            # 消息系统
│   │   ├── config.py             # 配置管理
│   │   └── exceptions.py         # 异常体系
│   │
│   ├── agents/                   # Agent实现层
│   │   ├── simple_agent.py       # SimpleAgent实现
│   │   ├── react_agent.py        # ReActAgent实现
│   │   ├── reflection_agent.py   # ReflectionAgent实现
│   │   └── plan_solve_agent.py   # PlanAndSolveAgent实现
│   │
│   ├── tools/                    # 工具系统层
│   │   ├── base.py               # 工具基类
│   │   ├── registry.py           # 工具注册机制
│   │   ├── chain.py              # 工具链管理系统
│   │   ├── async_executor.py     # 异步工具执行器
│   │   └── builtin/              # 内置工具集
│   │       ├── calculator.py     # 计算工具
│   │       └── search.py         # 搜索工具
└──
```
HelloAgents的架构设计遵循了"分层解耦、职责单一、接口统一"的核心原则，这样既保持了代码的组织性，也便于按照章节扩展内容。

## Hello Agent LLM扩展

1. **多提供商支持**：实现对 OpenAI、ModelScope、智谱 AI 等多种主流 LLM 服务商的无缝切换，避免框架与特定供应商绑定。
2. **本地模型集成**：引入 VLLM 和 Ollama 这两种高性能本地部署方案，作为对第 3.2.3 节中 Hugging Face Transformers 方案的生产级补充，满足数据隐私和成本控制的需求。
3. **自动检测机制**：建立一套自动识别机制，使框架能根据环境信息智能推断所使用的 LLM 服务类型，简化用户的配置过程。
### 多供应商
引入MyLLM的基类，通过重写__init__的方法，来支持扩展其他厂商的大模型

```
llm = MyLLM(provider="modelscope")
```

```
class MyLLM(HelloAgentsLLM):
    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        provider: Optional[str] = "auto",
        **kwargs
    ):
        # 检查provider是否为我们想处理的'modelscope'
        if provider == "modelscope":
            print("正在使用自定义的 ModelScope Provider")      
            # 解析 ModelScope 的凭证
            # 验证凭证是否存在
            # 设置默认模型和其他参数
            # 使用获取的参数创建OpenAI客户端实例
        else:
            # 如果不是 modelscope, 则完全使用父类的原始逻辑来处理
            super().__init__(model=model, api_key=api_key, base_url=base_url, provider=provider, **kwargs)
```
### 支持本地模型
**在本地实现高性能、生产级的模型推理服务：** VLLM、[Ollama](https://zhida.zhihu.com/search?content_id=266464327&content_type=Article&match_order=1&q=Ollama&zhida_source=entity)高性能方案

首先安装并部署vllm、ollama，运行
最后调用方式如下：
```
llm_client = HelloAgentsLLM(
    provider="vllm",
    model="Qwen/Qwen1.5-0.5B-Chat", # 需与服务启动时指定的模型一致
    base_url="http://localhost:8000/v1",
    api_key="vllm" # 本地服务通常不需要真实API Key，可填任意非空字符串
)
```

### 自动检测机制
为了尽可能减少用户的配置负担并遵循“约定优于配置”的原则，`HelloAgentsLLM` 内部设计了两个核心辅助方法：
* `_auto_detect_provider` ：负责根据环境信息推断服务商
* `_resolve_credentials`：根据推断结果完成具体的参数配置。

1. `_auto_detect_provider` 方法负责根据环境信息，按照下述优先级顺序，尝试自动推断服务商：

	1. **最高优先级：检查特定服务商的环境变量** 这是最直接、最可靠的判断依据。框架会依次检查 `MODELSCOPE_API_KEY`, `OPENAI_API_KEY`, `ZHIPU_API_KEY` 等环境变量是否存在。一旦发现任何一个，就会立即确定对应的服务商。
	    
	2. **次高优先级：根据 `base_url` 进行判断** 如果用户没有设置特定服务商的密钥，但设置了通用的 `LLM_BASE_URL`，框架会转而解析这个 URL。
	    
	3. **辅助判断：分析 API 密钥的格式** 例如，某些服务商的 API 密钥有固定的前缀或独特的编码格式。不过，由于这种方式可能存在模糊性（例如多个服务商的密钥格式相似），因此它的优先级较低，仅作为辅助手段。

2. `provider` 被确定（无论是用户指定还是自动检测），`_resolve_credentials` 方法便会接手处理服务商的差异化配置。它会根据 `provider` 的值，去主动查找对应的环境变量，并为其设置默认的 `base_url`。

## 框架接口实现
>在上节构建了 `HelloAgentsLLM` 这一核心组件，解决了与大语言模型通信的关键问题。另外需要一系列配套的接口和组件来处理数据流、管理配置、应对异常，并为上层应用的构建提供一个清晰、统一的结构。

这部分学习以下三个核心文件：
- `message.py`： 定义了框架内统一的消息格式，确保信息传递的标准化。
- `config.py`： 中心化的配置管理方案，使框架的行为易于调整。
- `agent.py`： 定义了所有智能体的抽象基类（`Agent`），为后续实现不同类型的智能体提供统一的接口和规范。

### Message 类
* 将 `role` 字段的取值严格限制为 `"user"`, `"assistant"`, `"system"`, `"tool"` 四种，对应 OpenAI API 的规范，保证了类型安全。
* 核心字段： `content` 和 `role` 
* 增加了 `timestamp` 和 `metadata`字段，为日志记录和未来功能扩展预留了空间。
* 核心功能之一`to_dict()` 方法是其，负责将内部使用的 `Message` 对象转换为与 OpenAI API 兼容的字典格式

### cofig类
将配置项按逻辑划分为 `LLM配置`、`系统配置` 等，使结构一目了然。其次，每个配置项都设有合理的默认值，保证了框架在零配置下也能工作。最核心的是 `from_env()` 类方法，它允许用户通过设置环境变量来覆盖默认配置，无需修改代码，这在部署到不同环境时尤其有用。

### Agent抽象基类
`Agent` 类是整个框架的顶层抽象。它定义了一个智能体应该具备的通用行为和属性，但并不关心具体的实现方式。
```
"""Agent基类"""
from abc import ABC, abstractmethod
from typing import Optional, Any
from .message import Message
from .llm import HelloAgentsLLM
from .config import Config

class Agent(ABC):
    """Agent基类"""
    
    def __init__(
        self,
        name: str,
        llm: HelloAgentsLLM,
        system_prompt: Optional[str] = None,
        config: Optional[Config] = None
    ):
        self.name = name
        self.llm = llm
        self.system_prompt = system_prompt
        self.config = config or Config()
        self._history: list[Message] = []
    
    @abstractmethod
    def run(self, input_text: str, **kwargs) -> str:
        """运行Agent"""
        pass
    
    def add_message(self, message: Message):
        """添加消息到历史记录"""
        self._history.append(message)
    
    def clear_history(self):
        """清空历史记录"""
        self._history.clear()
    
    def get_history(self) -> list[Message]:
        """获取历史记录"""
        return self._history.copy()
    
    def __str__(self) -> str:
        return f"Agent(name={self.name}, provider={self.llm.provider})"
```
造函数 `__init__` 清晰地定义了 Agent 的核心依赖：名称、LLM 实例、系统提示词和配置

最重要的部分是使用 `@abstractmethod` 装饰的 `run` 方法，它强制所有子类必须实现此方法，从而保证了所有智能体都有统一的执行入口。

基类还提供了通用的历史记录管理方法，这些方法与 `Message` 类协同工作


## Agent范式框架化
首先实现基类Simple Agent、ReAct Agent、Reflection Agent的基类，当需要自定义时，基于这些基类进行扩展，最后实例化并使用自定义的范式Agent

### 示例：基于基类ReAct Agent实现框架化的Agent

提示词优化：
```
MY_REACT_PROMPT = """你是一个具备推理和行动能力的AI助手。你可以通过思考分析问题，然后调用合适的工具来获取信息，最终给出准确的答案。

## 可用工具
{tools}

## 工作流程
请严格按照以下格式进行回应，每次只能执行一个步骤:

Thought: 分析当前问题，思考需要什么信息或采取什么行动。
Action: 选择一个行动，格式必须是以下之一:
- `{{tool_name}}[{{tool_input}}]` - 调用指定工具
- `Finish[最终答案]` - 当你有足够信息给出最终答案时

## 重要提醒
1. 每次回应必须包含Thought和Action两部分
2. 工具调用的格式必须严格遵循:工具名[参数]
3. 只有当你确信有足够信息回答问题时，才使用Finish
4. 如果工具返回的信息不够，继续使用其他工具或相同工具的不同参数

## 当前任务
**Question:** {question}

## 执行历史
{history}

现在开始你的推理和行动:
"""
```
重写ReActAgent的完整实现

创建`my_react_agent.py`文件来重写ReActAgent：
```
# my_react_agent.py
import re
from typing import Optional, List, Tuple
from hello_agents import ReActAgent, HelloAgentsLLM, Config, Message, ToolRegistry

class MyReActAgent(ReActAgent):
    """
    重写的ReAct Agent - 推理与行动结合的智能体
    """

    def __init__(
        self,
        name: str,
        llm: HelloAgentsLLM,
        tool_registry: ToolRegistry,
        system_prompt: Optional[str] = None,
        config: Optional[Config] = None,
        max_steps: int = 5,
        custom_prompt: Optional[str] = None
    ):
        super().__init__(name, llm, system_prompt, config)
        self.tool_registry = tool_registry
        self.max_steps = max_steps
        self.current_history: List[str] = []
        self.prompt_template = custom_prompt if custom_prompt else MY_REACT_PROMPT
        print(f"✅ {name} 初始化完成，最大步数: {max_steps}")
```

其初始化参数的含义如下：

- `name`： Agent的名称。
- `llm`： `HelloAgentsLLM`的实例，负责与大语言模型通信。
- `tool_registry`： `ToolRegistry`的实例，用于管理和执行Agent可用的工具。
- `system_prompt`： 系统提示词，用于设定Agent的角色和行为准则。
- `config`： 配置对象，用于传递框架级的设置。
- `max_steps`： ReAct循环的最大执行步数，防止无限循环。
- `custom_prompt`： 自定义的提示词模板，用于替换默认的ReAct提示词。

框架化的ReActAgent将执行流程分解为清晰的步骤：

```
def run(self, input_text: str, **kwargs) -> str:
    """运行ReAct Agent"""
    self.current_history = []
    current_step = 0

    print(f"\n🤖 {self.name} 开始处理问题: {input_text}")

    while current_step < self.max_steps:
        current_step += 1
        print(f"\n--- 第 {current_step} 步 ---")

        # 1. 构建提示词
        tools_desc = self.tool_registry.get_tools_description()
        history_str = "\n".join(self.current_history)
        prompt = self.prompt_template.format(
            tools=tools_desc,
            question=input_text,
            history=history_str
        )

        # 2. 调用LLM
        messages = [{"role": "user", "content": prompt}]
        response_text = self.llm.invoke(messages, **kwargs)

        # 3. 解析输出
        thought, action = self._parse_output(response_text)

        # 4. 检查完成条件
        if action and action.startswith("Finish"):
            final_answer = self._parse_action_input(action)
            self.add_message(Message(input_text, "user"))
            self.add_message(Message(final_answer, "assistant"))
            return final_answer

        # 5. 执行工具调用
        if action:
            tool_name, tool_input = self._parse_action(action)
            observation = self.tool_registry.execute_tool(tool_name, tool_input)
            self.current_history.append(f"Action: {action}")
            self.current_history.append(f"Observation: {observation}")

    # 达到最大步数
    final_answer = "抱歉，我无法在限定步数内完成这个任务。"
    self.add_message(Message(input_text, "user"))
    self.add_message(Message(final_answer, "assistant"))
    return final_answer
```

通过以上重构，我们将 ReAct 范式成功地集成到了框架中。


## 工具模块
#### `Tool` 基类 — 核心抽象,定义接口规范

```
class Tool(ABC):

def __init__(self, name: str, description: str): ...

@abstractmethod
def run(self, parameters: Dict[str, Any]) -> str: ...

@abstractmethod
def get_parameters(self) -> List[ToolParameter]: ...
```

设计思想：

- `run()` 统一接口：所有工具以一致方式执行，收字典参数、返字符串结果
- `get_parameters()` 自省能力：让框架能自动做参数验证和文档生成
- `name` / `description` 元数据：支撑工具的可发现性和可理解性

#### (2) `ToolParameter` 参数，定义参数验证和文档生成支持

```
class ToolParameter(BaseModel):

name: str

type: str

description: str

required: bool = True

default: Any = None
```

支持类型检查、默认值、文档自动生成。

#### (3) `ToolRegistry` 注册表 — 管理中枢

两种注册方式：

|方式|适用场景|特点|
|---|---|---|
|`register_tool(Tool对象)`|复杂工具|完整参数定义和验证|
|`register_function()`|简单工具|快速集成现有函数|

关键方法：

- `register_tool()` — 注册 Tool 实例
- `register_function()` — 直接注册函数作为工具
- `get_tools_description()` — 生成工具描述字符串（用于构建 Agent 提示词）
- `to_openai_schema()` — 转换为 OpenAI function calling 标准格式

**为什么需要 ToolRegistry？用一个故事讲解**
场景：没有 ToolRegistry 的混乱世界

假设你在做一个"生活助手 Agent"，用户问：
> "帮我算一下 15 * 8 + 32，然后再搜一下 Python 是什么"
 如果没有 `ToolRegistry`，你的代码可能是这样的：

硬编码方式 

```
class Agent:

def __init__(self):

self.calculator = MyCalculator() # 计算器写死在代码里

self.searcher = TavilySearch() # 搜索引擎也写死在代码里

def run(self, user_input):

if "计算" in user_input:

expr = parse_expr(user_input)

return self.calculator.run(expr)

elif "搜索" in user_input:

query = parse_query(user_input)

return self.searcher.search(query)
```

问题来了：

- 想加一个新工具？改 Agent 的 `__init__` 源码
- 想删掉某个工具？改 Agent 的 `__init__` 源码
- 想给不同用户配不同工具？得写多个 Agent 类
- 想知道现在有哪些工具可用？翻源码数一数
- 想换一种工具实现（比如把 Tavily 换成 SerpApi）？改源码，改完还得测试整个 Agent

这就是紧耦合的痛苦。

---

**用 ToolRegistry 的有序世界**

有了 `ToolRegistry`，工具变成了"可插拔的零件"：

创建注册表（工具的"仓库"）
registry = ToolRegistry()

 需要什么工具，往里注册
```
registry.register_function("calculator", "数学计算", my_calculate)
registry.register_function("search", "搜索引擎", my_search)
registry.register_function("weather", "查天气", get_weather)
```

Agent 只认识注册表，不认识具体工具
```
agent = MySimpleAgent(
name="生活助手",
llm=llm,
tool_registry=registry,
enable_tool_calling=True
)
```
