---
title: jwt、session、token、cookie
published: 2026-07-26
pinned: false
description: 之前实习的时候被问到session和cookie的区别，答得比较浅，本篇笔记用来透彻的学习相关知识
tags:
  - 后端
category: 后端
draft: false
---
# session and cookie
## 背景

http的每次请求都是没有包含状态的，服务器不会认识每一个请求，在服务器眼里每一个请求都是单独的，独立的。但是作为用户，有些请求需要验证，如果每次都单独验证体验感会很差。所以需要验证一次，被服务器记住。

所以需要引入一种会话机制，来让服务器认识每一个请求--session。

session是在服务器记录的，每一个session都有一个session id，每一个session单独存放一个用户的相关信息或者其他需要的数据。

cookie存在浏览器，最重要的内容是session id，每一次带上session id去请求，服务器比对通过后，在session中获取对应的用户信息。从而实现上述需求。

## cookie

cookie保存在浏览器，每一次浏览器发起的请求都会自动携带。

特点：
* 浏览器自己管理，存储于浏览器
* 大小4kb
* 敏感信息不能明文存放（如密码）

## session

session是服务器为用户创建的一个用户专属的数据空间；用来保存用户的登录状态，一些简单的业务信息，比如购物车等。每一个session都有唯一的session id。

特点：
* 存储于服务器，redis、内存
* 第一次用户请求时创建
* 设置过期时间
* 安全
* 存储空间大

## 实践案例
1. 用户登录，创建，set信息
```java
	   // 2. 创建 Session（关键操作）
	    HttpSession session = request.getSession(); 
	    
	    // 3. 将用户信息存入 Session（服务器端）
	    session.setAttribute("userInfo", username); 
	    session.setAttribute("isLogin", true);
```

2.   浏览器接收到 `Set-Cookie` 头，将 `JSESSIONID=ABC123` 保存到本地。
   
3. 用户再次访问，进行校验
   `
```	java
	// 2. 服务器根据 Cookie 中的 JSESSIONID 找到对应的 Session
		HttpSession session = request.getSession(false); // false 表示不存在不新建
		// 3. 校验用户是否已登录
		if (session != null && session.getAttribute("isLogin") != null) {
			String user = (String) session.getAttribute("userInfo");
			// 显示用户信息，访问正常
		} else {
		// 未登录，重定向到登录页
		response.sendRedirect("login.html");
		}
```

4. 退出销毁session




# JWT and token

包含关系，jwt是token的一种实现

## 背景

session方案在分布式系统中需要引入redis，同时cookie对于移动端支持不友好。

所以需要引入一种方法，让服务端不用存这些信息，而只是通过签发一个凭证，客户端每次请求带上凭证，服务器能计算出用户是谁。--token思想

而jwt是当前最主流的token实现方案。

## jwt
流程：用户登录后，服务器返回一个jwt，客户端在后续的请求`Authorization` Header 中携带
特点：jwt是可以被公钥/私钥签名的，可确保内容安全传递

## 结构
* header：包含采用的算法
* payload：包含要传递的数据
* Signature：前两部分（Header + Payload）加上一个密钥（Secret），通过 Header 中指定的算法生成，用于验证 Token 是否被篡改。HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  secret
)

优点：
1. **无状态/可扩展性**：服务器不存储任何 Session，天然支持水平扩展，无需 Redis 等中间件。
2. **跨域/CORS友好**：Cookie 有跨域限制（需复杂配置），JWT 通过 Header 传输，调用不同域名的 API 非常方便。
3. **适合移动端**：不依赖 Cookie，App 可以轻松存储和使用。
4. **性能**：验证只需计算签名和解析 JSON，不需要查询数据库（除非要查更详细的权限），在高并发下优势明显。
   
缺点：
JWT 默认**未加密**，Payload 可被解码查看。如果被窃取（如 XSS 攻击），攻击者可冒充用户。**防御**：必须使用 HTTPS；敏感操作使用短有效期


|特性|Session|JWT|
|---|---|---|
|**存储位置**|服务端（内存/Redis）|客户端（浏览器本地/App）|
|**状态性**|**有状态**（服务器需存储）|**无状态**（服务器不存储）|
|**扩展性**|需共享存储（Redis）|天然支持分布式|
|**主动吊销**|容易（调用 `invalidate`）|困难（必须等到过期）|
|**数据大小**|小（只传 Session ID）|可能较大（含完整信息）|
|**安全性**|较高（用户数据在服务端）|中等（Payload 可解码，需签名防篡改）|
|**典型场景**|传统 Web 应用、对安全性要求极高|RESTful API、微服务、移动应用|