---
title: claude code的层层拼装
published: 2026-07-27
pinned: false
description: 学习了一下cc的原理，笔记记录一下cc从一个agent到一套harness的流程与思想
tags:
  - Agent
  - claude_code
category: Agent
draft: false
---
# 一、agent到agent loop

单独的调用llm只能处理一次任务；即使把一次llm的调用封装为agent，当我们通过agent来处理任务的时候，只能通过工作流编排的方式来实现我们的任务，但这样的方式自主性并不高，更多的是人在做规划，llm的能力在这种方式里相当于一次工具调用。

但llm也是有推理能力和规划能力的，很多任务也可以交由llm来推理，来更灵活的规划，从而可以做复杂任务。

我们可以通过while循环的方式来让大模型能一直自己运作，产生的新的结果塞进上下文，下一轮循环进行新的推理。while循环的终止条件为没有新的工具调用。没有新的工具调用代表当前内容足够进行回答，不需要新的额外的内容来完整推理。

终止循环的条件，除了判断是否还需要工具以外，生产中还需要考虑如下：
1. 上下文超出限制
2. 超过可接受的最大轮次
3. 模型不可用
等等

![](../images/Pasted%20image%2020260727141640.png)

# 二、agent+工具

llm可以输出文字、输出代码，但是无法直接和计算机进行交互。想要和计算机交互最简单的方式就是通过bash实现各种各样的操作，由llm输出操作命令，再由代码接管执行命令，输出的结果再作为新的补充内容回到loop里；

但是对于简单的读取文件、写入文件、读取时间等等一系列操作，如果每次都需要大模型通过bash来做会变得复杂，多了一层翻译、浪费token、容易出错；

对于经常使用的操作我们可以封装为工具，为工具添加描述，在llm调用之前，将工具清单提供给llm进行推理和规划；如果大模型需要调用，则加入tool_use，后续进行调用。

在各种agent系统里，各自业务里常用的操作都可以封装为tool。
![](../images/Pasted%20image%2020260727142511.png)

# 三、agent+禁止规则

但我们赋予agent操纵工具的权利，并且希望能自主帮我们干活；我们就需要考虑风险问题。如果把电脑的操作权利交给一个不可控的东西的时候，我们就要想办法避免这种危险（harness思想）

在大模型调用后、工具执行之前，加上N道闸门

N道闸门，从严格到宽松，llm的每一次操作都需要经过这N道闸门的审核才能放行：

| 闸门      | 作用                         | 命中后       |
| ------- | -------------------------- | --------- |
| 1. 拒绝列表 | 永远禁止的操作（`rm -rf /`、`sudo`） | 直接拒绝，不执行  |
| 2. 规则匹配 | 取决于上下文的操作（写工作区外、`rm` 文件）   | 交给闸门 3    |
| 3. 用户审批 | 闸门 2 命中后，暂停等用户确认           | 用户决定允许或拒绝 |

![](../images/Pasted%20image%2020260727144038.png)

生产中除了这几道闸门以外，还包括：zod mod调用工具的参数类型检查、来自项目的规则、来自用户的规则等

# 四、agent+hook

不断地组装新的内容来给大模型，如果我们只是按照顺序来塞进一轮循环中，循环体会变得臃肿；不符合高内聚低耦合的思想；

对于这个问题可以采用hook的方式，把这些操作从循环体中解耦出来；hook可以在工具执行前调用，也可以在工具执行后调用；

通过register_hook、trigger_hooks等方法来讲操作注册进hook中或者触发；

相关操作包括：permission、日志、摘要等

![](../images/Pasted%20image%2020260727145453.png)
到此为止，整个agent可以安全和顺畅的进行工作

# 五、 agent+规划能力

一个agent可以安全顺畅的进行一次任务处理了，但是对于复杂问题的时候，一轮一轮的执行会使得上下文变多，执行过程中产生的bug、以及bug的解决等无关问题会分散大模型的注意力，因为上下文的存在，会使得大模型在一次次的循环中效率下降，甚至脱离任务等。

参考plan and solve的范式可以解决这个问题；为了实现plan and solve，cc引入了todo list。让agent在解决问题之前先想清楚。
![](../images/Pasted%20image%2020260727150026.png)

新增一个todo write的工具，让大模型在第一次调用的时候，给出解决计划，通过list的方式维护在内存中。list中的每一个元素都必须包含state来记录状态、和对应操作；后续的每一轮执行都可以看到这个list，以及修改list中元素的状态。

当几个轮次没有调用该工具时，需要在下轮的提示词中注入提醒：更新todo；防止走歪；

# 六、agent + sub Agent

当一个agent处理一个工作量比较大的任务的时候，可能遇到了新的bug，为了继续下去只能去解决新的bug，在这个过程中产生了非常长的调用链，稀释了大模型的注意力；我们自己遇到bug时，也会新开一个agent来解决bug，解决完再回到原来窗口继续。

本质上就是开一个新的agent，**并且把两个agent的上下文分隔开，不让第二个agent的调用内容来污染第一个agent**

处理方式就是新增一个工具，允许agent在创建一个新的agent，新的subagent在工作结束后，把结果返回给第一个agent中，**仅仅返回结果！**；并且sub agent**不能再创建新的sub agnet**

![](../images/Pasted%20image%2020260727152019.png)

# 七、agent + skill

skill有点类似于tool，也是按需加载的，不同点在于，tool是硬编码的工具，入参到处理到返回结果，一套内容是写死的。但是skill是一套解决内容的方法论，可以包括提示词，相关文件，脚本。当大模型调用skill，读到skill里的内容，skill目录中的内容可以提示大模型怎么处理，可能完全按照流程，可能只走了部分流程，这个过程是灵活的。

工具：读文件、查天气、计算数值、、、（死的）
skill：sql规范、前端规范、项目基建配置、、、（灵活的）
![](../images/Pasted%20image%2020260727160740.png)

原理：harness会扫描skills，每个skill目录会包含一个skill.md文件，主要是包含名字，相关描述；当大模型需要处理相关内容时，如果有符合条件的skill，就会去针对性的加载该skill，把md注入进提示词里，引导大模型通过bash等操作去使用相关脚本、资源等

# 八、agent + 上下文

复杂任务中，上下文会一直累积，可能读了许多文件，调用了许多工具，这些内容全部塞进上下文窗口里再去调用大模型，可能会导致超出token上限；但这些东西又没办法丢，可能还是有价值的；

所以需要引入上下文压缩：
![](../images/Pasted%20image%2020260727161910.png)
这几个处理方式分别对应不同情况：
l1：对应消息数量太多
l2：对应旧内容太多了
l3：包含超大结果
l4：任然超过token阈值，交给大模型进行压缩提取摘要

# 九、agent + 记忆系统

在第八节的内容中会对记忆进行压缩，但压缩后的记忆里的细节可能会丢失。

cc引入memory机制，有一个memory目录，被压缩过的上下文都会保存到这里，同时还有memory.md作为索引，记录了描述、类型等，索引会作为提示词被注入。

记忆有四类：user（记录用户）、feedback（记录一些规则）、project（记录项目情况）、reference（记录找东西怎么找）
![](../images/Pasted%20image%2020260727170209.png)
每一个记忆md
```python
--- name: user-preference-tabs description: User prefers tabs for indentation type: user --- User prefers using tabs, not spaces, for indentation. **Why:** Consistency with existing codebase conventions. **How to apply:** Always use tabs when writing or editing files.
```

MEMORY.md,每一行记录一个链接
```python
- [user-preference-tabs](user-preference-tabs.md) — User prefers tabs for indentation
```

# 十、agent + 提示词

每一次塞给大模型的内容都可能会有很多，有来自用户的，有来自tool list的、有tool结果的，有memory、有skill、有subagent、、、、

所以对于每一次大模型的提示词，需要采取拼接的形式来组织。每一次调用替换对应的部分：

| Section   | 加载策略 | 内容       | 判断依据                     |
| --------- | ---- | -------- | ------------------------ |
| identity  | 始终   | 你是谁、怎么做事 | 始终存在                     |
| tools     | 始终   | 可用工具列表   | `enabled_tools`          |
| workspace | 始终   | 工作目录     | 始终存在                     |
| memory    | 按需   | 相关记忆内容   | `.memory/MEMORY.md` 是否存在 |

# 十一、 agnet+ error

大模型的调用总是会遇到一些error，作为harness工程，必须要保证把这种不可控性控制住。

以下是常见的情况以及恢复方式：

|模式|触发|恢复动作|
|---|---|---|
|输出截断|`max_tokens`|升级 8K→64K / 续写提示|
|上下文超限|`prompt_too_long`|reactive compact → 重试|
|临时故障|429 / 529|指数退避 + 抖动，连续 529 可切换备用模型|
其他还包括：大模型厂商认证、超时等


这一过程在循环中的大模型调用阶段


# 十二、agent + task系统

## task
这一部分是对于todo的升级；todo仅仅只是在缓存中，对于大型任务，时间长，任务重，并且需要有任务的**先后顺序**；所以引入task系统。

task设计为一个工具供大模型调用，创建一个task的json文件，持久化至磁盘，文件内容记录：任务、**状态**、前置任务列表、处理任务的agent。

```python
class Task: 
id: str 
subject: str 
description: str 
status: str # pending | in_progress | completed 
owner: str | None # Agent 名（多 Agent 场景） blockedBy: list[str] # 依赖的任务 ID 列表
```

由agent来认领任务去完成

完成前置任务解锁后置任务，类似力扣课程表的那题。

## backgroun task

有一些任务时耗费时间的，比如一些install之类的bash操作

cc中首先会识别出这些费时间的task（CC 的 bash 工具 schema 里有 `run_in_background: boolean` 参数（`BashTool.tsx:241`）

对于需要执行的这些任务，扔到其他线程执行，执行后的结果注入下一轮的提示词中

# 十三 agent赋予角色，多个合作

## 作用与流程
前面的sub agent只是临时工，完成这个任务就没了，但对于固定的工作模式，可以引入team的方式。

难点在于agent之间的通信。

leader agent启用新的队友，通过 spawn_teammate_thread 把新的agent跑在自己的线程里

每一个团队中的agent，都有一个jsonl邮箱，向某个agent通信，就往对方文件里append

cc中的队友agent的流程：
1. 队友遇到需要审批的操作 → 发 `permission_request` 到 Lead 收件箱
2. Lead 的 `useInboxPoller` 检测到请求 → 路由到审批队列
3. 用户审批后 → Lead 发 `permission_response` 回队友
4. 队友的 `useSwarmPermissionPoller`（每 500ms 轮询）收到回复 → 继续或拒绝

## 约定

到这一步多个agent可以互相干活了，但是缺少结构化的协议，agent 的通信中可能会涉及危险操作，比如：leader要关闭队友agent，或者队友要执行的操作需要leader来审批

通过一下三个组件来处理：

**ProtocolState**
每次通过ProtocolState来发起请求，主要关注request_id，后续的回复执行链路都基于这个request_id

```python
@dataclass 
class ProtocolState: 
request_id: str # 唯一 ID，如 "req_004281" 
type: str # "shutdown" | "plan_approval" 
sender: str # 发起方 
target: str # 接收方 
status: str # pending | approved | rejected 
payload: str # 计划文本或关机原因 
created_at: float # 时间戳 
pending_requests: dict[str, ProtocolState] = {}
```

**dispatch_message**
**match_response**

举例：leader要让bob关机，ProtocolState的形式发送请求，bob收到之后通过dispatch_message路由到关机的相关操作方法，关机完成后match_response再回复leader，完成握手


# 十四、agent + 空闲轮询

### 轮询
多个agent能相互通信，但是leader发布了多个任务后，如果指定各个agent来处理任务会比较麻烦。

cc引入**idle_poll**，每五秒轮询一次，前面提到task的元数据里有state、agent，当一个agent完成任务提交后，会进入轮询状态，扫描到存在任务时pedding后，会接取任务并且去完成。完成后进行Summary，提交结果；

# 十五、 MCP

前面提到的tool、skill都是自己装配上去的，但是存在一些工具，开发出来后需要适配到各个地方，于是通过mcp的方式来实现，统一了工具和各个host之间的协议，让工具可以随意的被所有人使用。

MCP相关概念：

| 概念                 | 作用                                  |
| ------------------ | ----------------------------------- |
| MCPClient          | Agent 端的客户端，连接 server、发现工具、调用工具     |
| MCP Server         | 外部服务，实现 `tools/list` + `tools/call` |
| assemble_tool_pool | 把内置工具和 MCP 工具组装成一个工具池               |
| mcp_server_tool 命名 | 避免不同 server 的工具名冲突                  |
| Host               | 宿主，比如cursor、cc、dify                 |


原理如下
* host中的mcp client启动后，会扫描配置好的mcp，并检查哪些是可用的，这些mcp被放入注册表中，放入系统提示词中。

* 当host调用大模型，并且大模型判断需要使用某个mcp时，解析大模型吐出的这段文本，把它翻译成标准的**JSON-RPC 2.0 协议格式**，构建mcp请求，由mcp client发起调用；

* 请求来到 mcp service后，有三层，第一层负责通信，接受请求，第二层负责路由，检查这个请求调用了什么东西，并交由对应的方法去处理；第三层就是处理相关业务逻辑；最后再返回结果