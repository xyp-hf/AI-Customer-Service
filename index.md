---
html:
  toc: true
  embed_local_images: true
  offline: true
  html-show-sidebar-toc: false
---

# 大模型多机多卡分布式环境构建

## 1. 分布式推理环境构建

### 一 背景描述

#### 1.1 当前现状
我们在部署大模型的时候，如果遇到超大模型的时候，往往一个GPU或者一台服务器的GPU是加载不了完整的模型的，所以我们需要对模型进行分布式部署，比如我们要部署满血版的DeepSeek-v3模型，仅仅部署模型需要1370G的显存，这个时候就必须使用到多机多卡的方式部署。当前演示为了能让所有小伙伴有条件跟着我进行实操，我演示部署Qwen2.5-14B-Instruct的模型，使用4090的显卡（24G显存）。

#### 1.2 技术方案

采用Ray+vLLM技术方案

##### 什么是Ray?
Ray 就是一个“分布式任务调度器”，帮你把一大堆计算任务（比如训练、推理）拆成小块，扔到很多机器上一起跑，速度飞快，还不用你操心怎么协调。

  🧠 举个生活例子：
  想象你在开一个外卖平台，订单（任务）特别多，一个厨房（一台机器）根本做不过来。
  Ray 就像是你的“总调度员”，它会：
  - 把订单按菜品拆成小任务；
  - 看哪个厨师（CPU/GPU）空闲，就扔过去；
  - 如果某个厨师炸了（机器挂了），它立马换人；
  - 最后把菜（结果）给你端回来，整整齐齐。

  🧰 Ray 在大模型部署里干啥？
  大模型（比如 DeepSeek、LLaMA）动不动就几百 GB，一台机器根本装不下，Ray 就帮你：

| 功能 | 大白话解释 |
| :--- | :--- |
| **模型分片** | 把大模型切成几块，分别放在不同 GPU 上，像拼乐高一样。 |
| **并行推理** | 很多用户同时提问，Ray 把问题分给不同机器一起回答，响应快。 |
| **自动扩缩容** | 用户多了就加机器，用户少了就撤机器，省钱。 |
| **容错** | 某台机器挂了，Ray 自动把任务挪到别的机器，用户无感知 |
  
  🧪 举个实际场景：
  你有一个 DeepSeek-V3 满血版（1.3TB），单卡根本装不下，Ray 会：
  a. 把模型切成 10 份，分别放到 10 张 A100 上；
  b. 用户提问时，Ray 把问题广播给这 10 张卡，大家一起算；
  c. 最后把结果拼起来，返回答案；
  d. 如果某张卡炸了，Ray 立马换一张，继续服务。

##### 什么是vLLM?
  vLLM 是“大模型推理加速器”，一键把模型变成高并发、低延迟的 API 服务，显存省、吞吐猛。

| 项目名称 | 项目特点 | 适合场景 |
| :--- | :--- | :--- |
| Ollama | Ollama之所以能够受到最多开发者的关注，一个最根本的原因就是其部署和使用太简单了，兼容多种操作系统，且都提供了一键安装、单命令启动的快捷方式，可以极大降低初学者使用开源大模型的门槛，同时Ollama框架提供原生 RESTAPI和OpenAIAPI兼容性，也可以非常轻松的接入到其他的客户端中。不过项目开发中，支持并发较少。 | 适合个人项目开发适合企业里轻量级的项目 |
| llama.cpp | llama.cpp是使用没有任何依赖关系的纯C/C++实现，性能很高，可定制化和优化项非常多，但也因为底层是C语言，直接导致上手难度极高。 | 适合企业级项目(但是需要使用的人对C/C++语言熟悉) |
| Vllm | Ollama的优势在于其简洁性，那么VIlm则是一个另辟蹊径、优先考虑性能和可扩展性的大模型部署框架，其核心的优化点在高效内存管理、持续批处理功能和张量并行性，从而在生产环境中的高吞吐量场景中表现极佳。 | 适合企业级高并发项目 |

#### 1.3 主机规划
Qwen2.5-14B-Instruct  14 * 2 = 28G ,  GPU 4090(24G)
当前是用平台为[优云智算——注册连接](https://passport.compshare.cn/register)

![主机规划](1-1.PNG)
![主机规划](1-2.PNG)

| 主机名 | 内网IP地址 | GPU个数 |
| :--- | :--- | :--- |
| **host1** | 10.60.197.243 | 1（4090） |
| **host2** | 10.60.43.107 | 1（4090） |
| **host3** | 10.60.32.65 | 1（4090） |

![主机规划](1-3.png)

### 二 分布式环境构建

#### 2.1 主机做免密

##### 2.1.1 做host1和host2,host3的免密

登录host1
ssh ubuntu@117.50.176.228

host1上执行
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N "" 
把公钥发给host2
ssh-copy-id -o StrictHostKeyChecking=no ubuntu@10.60.43.107

测试链接免密登录host2
ssh ubuntu@117.50.220.57
跟host3做免密
ssh-copy-id -o StrictHostKeyChecking=no ubuntu@10.60.32.65
测试
ssh ubuntu@117.50.175.53

##### 2.1.2 host2跟host1,host3的免密

host2上执行
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N "" 
跟host1做免密
ssh-copy-id -o StrictHostKeyChecking=no ubuntu@10.60.197.243
跟host3做免密
ssh-copy-id -o StrictHostKeyChecking=no ubuntu@10.60.32.65

##### 2.1.3 host3跟host1,host2的免密

host3上执行
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N "" 
跟host1做免密
ssh-copy-id -o StrictHostKeyChecking=no ubuntu@10.60.197.243
跟host2做免密
ssh-copy-id -o StrictHostKeyChecking=no ubuntu@10.60.43.107

#### 2.2 服务器同步依赖环境

##### 2.2.1 模型环境构建
**conda环境安装**

登录host1先安装conda环境

```bash
sudo apt update
## 安装miniconda
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
更换镜像源  wget https://mirrors.tuna.tsinghua.edu.cn/anaconda/miniconda/Miniconda3-latest-Linux-x86_64.sh
## 执行脚本
bash Miniconda3-latest-Linux-x86_64.sh
#刷新配置文件  source ~/.bashrc
检验安装状况  conda --version
```

一键替换为清华源

```bash
conda config --remove-key channels

conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main
conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/free
conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/cloud/conda-forge
conda config --add channels defaults

conda config --set show_channel_urls true
```
**创建环境**
conda create -n vllm python=3.11 -y (注意当前环境创建以及之后的设置集群中必须相同)
conda activate vllm
当前vllm环境安装ray
pip install "ray[default]" -i https://pypi.tuna.tsinghua.edu.cn/simple
当前环境安装vllm
pip install vllm -i https://pypi.tuna.tsinghua.edu.cn/simple
安装其他依赖环境
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121 -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install accelerate==0.29.3 -i https://pypi.tuna.tsinghua.edu.cn/simple

```bash
#安装transformers（使用镜像）
pip install transformers 
pip install torchaudio==2.5.1 -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install transformers==4.45.2 tokenizers==0.20.3 -i https://pypi.tuna.tsinghua.edu.cn/simple
#安装其他必要依赖
pip install requests numpy -i https://pypi.tuna.tsinghua.edu.cn/simple
python3 -c "
import sys
print(f'Python version: {sys.version}')
try:
    import torch
    print(f'✅ PyTorch {torch.__version__} installed')
    print(f'✅ CUDA available: {torch.cuda.is_available()}')
    if torch.cuda.is_available():
        print(f'✅ CUDA version: {torch.version.cuda}')
except ImportError as e:
    print(f'❌ PyTorch import failed: {e}')
try:
    import ray
    print(f'✅ Ray {ray.__version__} installed')
except ImportError as e:
    print(f'❌ Ray import failed: {e}')
try:
    import vllm
    print(f'✅ vLLM {vllm.__version__} installed')
except ImportError as e:
    print(f'❌ vLLM import failed: {e}')
"
```
**下载模型**
登录地址：https://www.modelscope.cn/
pip install modelscope (host1服务器上执行)
mkdir -p Qwen2.5-14B-Instruct(路径名称可以自行指定)
modelscope download --model Qwen/Qwen2.5-14B-Instruct  --local_dir ./Qwen2.5-14B-Instruct

```bash
nohup modelscope download --model Qwen/Qwen2.5-14B-Instruct  --local_dir ./Qwen2.5-14B-Instruct > modelscope_dow.log 2>&1 &
```

##### 2.2.2 打包vllm环境
**在host1上执行**
```bash
conda activate vllm
 #方法1：使用conda-pack（推荐）
 #先安装conda-pack
conda install conda-pack -y
conda pack -n vllm -o vllm_env.tar.gz
## conda pack -n reward3 -o reward3_env.tar.gz
  #传输到host2/host3
scp vllm_env.tar.gz ubuntu@10.60.43.107:/tmp/
```
**host2解压环境**
在host2上执行
```bash
#在host2上执行
#创建环境目录
mkdir -p ~/miniconda3/envs/vllm

 #解压环境
cd ~/miniconda3/envs/vllm
tar -xzf /tmp/vllm_env.tar.gz

#激活环境
source ~/miniconda3/envs/vllm/bin/activate
#修复路径
conda-unpack
 #测试环境
python -c "import torch, deepspeed, transformers; print('Environment OK')"

python -c "
import torch, deepspeed, transformers
print(f'PyTorch: {torch.__version__}')
print(f'DeepSpeed: {deepspeed.__version__}')
print(f'Transformers: {transformers.__version__}')
print(f'CUDA Available: {torch.cuda.is_available()}')
print(f'GPU Count: {torch.cuda.device_count()}')
"
同步完成
```

**host3同步环境**
scp vllm_env.tar.gz ubuntu@10.60.32.65:/tmp/

```bash
#在host3上执行
#创建环境目录
mkdir -p ~/miniconda3/envs/vllm

 #解压环境
cd ~/miniconda3/envs/vllm
tar -xzf /tmp/vllm_env.tar.gz

#激活环境
source ~/miniconda3/envs/vllm/bin/activate
#修复路径
conda-unpack
 #测试环境
python -c "import torch, deepspeed, transformers; print('Environment OK')"

python -c "
import torch, deepspeed, transformers
print(f'PyTorch: {torch.__version__}')
print(f'DeepSpeed: {deepspeed.__version__}')
print(f'Transformers: {transformers.__version__}')
print(f'CUDA Available: {torch.cuda.is_available()}')
print(f'GPU Count: {torch.cuda.device_count()}')
"
同步完成
```

#### 2.3 创建共享目录

##### 2.3.1 host1构建目录
在host1上执行
```bash
#在host1上执行 当前使用host0 为主节点
sudo apt update
sudo apt install nfs-kernel-server -y
```

```bash
#创建共享目录
sudo mkdir -p /shared/
#设置权限
sudo chown -R ubuntu:ubuntu /shared/
chmod -R 755 /shared/
```

把模型文件放入到共享目录中
scp -r Qwen2.5-14B-Instruct /shared/

```bash
#配置NFS导出（使用内网网段）
sudo tee /etc/exports << EOF
/shared 10.60.0.0/16(rw,sync,no_subtree_check,no_root_squash,insecure)
EOF
#启动NFS服务
sudo systemctl enable nfs-kernel-server
sudo systemctl start nfs-kernel-server
sudo exportfs -ra
 #验证NFS配置
sudo exportfs -v
showmount -e localhost
```

##### 2.3.2 host2挂载目录

切换到host2
```bash
 #SSH到host2
ssh ubuntu@10.60.43.107
#安装NFS客户端
sudo apt update
sudo apt install nfs-common -y
```

```bash
#创建挂载点
sudo mkdir -p /shared
#测试挂载 10.60.197.243 是主节点的地址
sudo mount -t nfs 10.60.197.243:/shared /shared
 #验证挂载
ls -la /shared/
df -h | grep shared 
```

```bash
#设置开机自动挂载
echo "10.60.11.131:/shared /shared nfs defaults,_netdev 0 0" | sudo tee -a /etc/fstab
```

##### 2.3.3 host3挂载目录

切换到host3 ,做同样的操作

```bash
#安装NFS客户端
sudo apt update
sudo apt install nfs-common -y

#创建挂载点
sudo mkdir -p /shared
#测试挂载 10.60.197.243 是主节点的地址
sudo mount -t nfs 10.60.197.243:/shared /shared
 #验证挂载
ls -la /shared/
df -h | grep shared 
```

```bash
#设置开机自动挂载
echo "10.60.11.131:/shared /shared nfs defaults,_netdev 0 0" | sudo tee -a /etc/fstab
```

#### 2.4 安装pdsh

##### 2.4.1 pdsh工具安装

pdsh（Parallel Distributed Shell）是一个强大的并行分布式Shell工具，主要用于在多个主机上并行执行命令。让我详细介绍它的作用和使用方法。

在host1上执行

```bash
#在host1上执行  只是为了在单节点方便控制其他服务器
sudo apt install pdsh -y
```

```bash
#创建PDSH配置目录
mkdir -p ~/.pdsh

 #创建机器列表
cat > ~/.pdsh/machines << EOF

# 训练集群节点
10.60.197.243   # host1 - 主节点
10.60.43.107  # host2 - 从节点
10.60.32.65  # host3 - 从节点
EOF

#创建组配置
cat > ~/.pdsh/groups << EOF
all: 10.60.197.243,10.60.43.107,10.60.32.65
workers: 10.60.43.107,10.60.32.65
master: 10.60.197.243
EOF
```

```bash
# 添加自己的主机密钥到known_hosts 个人主机IP
ssh-keyscan -H 10.60.197.243 >> ~/.ssh/known_hosts
ssh-keyscan -H $(hostname) >> ~/.ssh/known_hosts
```

```bash
# host1
echo 'export PDSH_RCMD_TYPE=ssh' >> ~/.bashrc
source ~/.bashrc
```

```bash
# host1
cat ~/.ssh/id_rsa.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

##### 2.4.2 pdsh工具测试

```bash
#测试PDSH连接
pdsh -w 10.60.197.243,10.60.43.107,10.60.32.65 "nvidia-smi --query-gpu=count --format=csv,noheader,nounits"
pdsh -w 10.60.197.243,10.60.43.107,10.60.32.65 'echo "$(hostname): $(whoami) - $(date)"'
pdsh -w 10.60.197.243,10.60.43.107,10.60.32.65 "hostname"
pdsh -w 10.60.197.243,10.60.43.107,10.60.32.65 'echo "PDSH test from $(hostname)"'
```

安装工具  ufw
pdsh -w 10.60.197.243,10.60.43.107,10.60.32.65 "sudo apt install ufw -y"

```bash
#安装完成后配置防火墙 当前只是防火墙配置 也可以不使用pdsh单独执行
pdsh -w 10.60.197.243,10.60.43.107,10.60.32.65 "
    echo '=== \$(hostname) 配置防火墙 ===' && \
    sudo ufw --force enable && \
    sudo ufw allow 22 && \
    sudo ufw allow 29500 && \
    sudo ufw allow 29501 && \·
    sudo ufw allow 2049 && \
    sudo ufw allow from 10.60.0.0/16 && \
    sudo ufw status numbered
"
```

```bash
# 所有节点都需要
sudo apt update
sudo apt install -y ninja-build
```

#### 2.5 设置hosts地址

| 节点 | 命令 |
| :--- | :--- |
| 1. 先查内网地址 | `ip route get 1 \| awk '{print $7; exit}'  # 假设输出 10.60.197.243（另一台就是 10.60.43.107）` |
| 2. 备份原文件 | `sudo cp /etc/hosts /etc/hosts.bak` |
| 3. 删掉 127.0.1.1 行（关键） | `sudo sed -i '/^127\.0\.1\.1/d' /etc/hosts` |
| 4. 把本机主机名绑定到内网 IP | `# 把下面三条里的 HOSTNAME 换成真实主机名，IP 换成本机内网地址 HOSTNAME=$(hostname) IP=$(ip route get 1 \| awk '{print $7}') echo "$IP $HOSTNAME" \| sudo tee -a /etc/hosts` |
| 5. 验证 | `python3 -c "import socket; print(socket.gethostbyname(socket.gethostname()))" # 应该输出 10.60.x.x，而**不是** 127.0.1.1` |

### 三 大模型分布式推理

#### 3.1  启动Ray集群

##### host1上执行

```bash
#在host1(10.60.197.243) 上执行
#启动Ray头节点
ray start --head --port=6379 --dashboard-host=0.0.0.0 --dashboard-port=8265 --num-gpus=1
#记录输出的连接信息，类似：
#ray start --address='10.60.197.243:6379'
```

##### host2上执行

```bash
#在host2 (10.60.43.107) 上执行
#使用host0输出的连接命令
ray start --address='10.60.197.243:6379' --node-ip-address='10.60.43.107' --num-gpus=1
```

##### host3上执行

```bash
#在host3 (10.60.32.65) 上执行
#使用host0输出的连接命令
ray start --address='10.60.197.243:6379' --node-ip-address='10.60.32.65' --num-gpus=1
```

##### host4上执行

```bash
#在host1上执行
ray status
```

##### 3台服务器都打开

```bash
#在3台机器上都执行，开放PyTorch分布式通信端口
sudo ufw allow 29500:29510/tcp
sudo ufw allow 6379/tcp    # Ray端口
sudo ufw allow 8265/tcp    # Ray Dashboard端口
```

#### 3.2 启动模型并测试

我们三台服务器，每台服务器有1个24G的GPU，我现在要启动模型Qwen2.5-14B-Instruct，这个模型的大小是28G，有40头的注意力，下面的启动脚本的参数我应该如何设置？

 **模型启动**

```bash
# 设置环境变量
export NCCL_DEBUG=INFO
export NCCL_IB_DISABLE=1
export NCCL_P2P_DISABLE=1
export GLOO_SOCKET_IFNAME=eth0
export NCCL_SOCKET_IFNAME=eth0

python -m vllm.entrypoints.openai.api_server \
  --model /shared/Qwen2.5-14B-Instruct \
  --host 0.0.0.0 \
  --port 8000 \
  --dtype bfloat16 \
  --tensor-parallel-size 2 \
  --pipeline-parallel-size 1 \
  --max-model-len 2048 \
  --gpu-memory-utilization 0.85 \
  --distributed-executor-backend ray \
  --api-key financial-reward-model-key
```

```bash
## vLLM命令参数详解

### 模型和服务参数
--model: 指定要加载的模型路径
--host 0.0.0.0: 允许所有IP访问（不限制来源）
--port 8000: API服务监听的端口号
--api-key: API访问的安全密钥

### 模型配置参数
--dtype bfloat16: 使用半精度浮点数，节省显存，略微降低精度
--max-model-len 2048: 模型处理的最大序列长度
--gpu-memory-utilization 0.85: 使用85%的GPU显存，留15%作为缓冲

### 并行配置参数
--tensor-parallel-size 2: 张量并行度
--pipeline-parallel-size 3: 流水线并行度
--distributed-executor-backend ray: 使用Ray作为分布式执行后端

### 性能优化参数
--disable-log-requests: 关闭请求日志，减少IO开销
```

![主机规划](1-4.PNG)

**模型测试**

```bash
curl -s http://10.60.197.243:8000/v1/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer financial-reward-model-key" \
  -d '{
    "model": "/shared/Qwen2.5-14B-Instruct",
    "prompt": "你好，请简单介绍一下你自己：",
    "max_tokens": 50,
    "temperature": 0.3
  }' | jq .
```

![主机规划](1-6.PNG)

## 2. 分布式微调环境构建

### — 微调环境构建

```bash
# Skywork/Skywork-Reward-V2-Llama-3.1-8B版本环境
conda create -n reward2 python=3.11 -y
pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1  -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install accelerate==0.29.3 -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install transformers==4.51.3 -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install deepspeed==0.15.4 -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install datasets==2.14.0 -i https://pypi.tuna.tsinghua.edu.cn/simple

```

安装完了以后，有版本冲突，所以继续安装两个依赖

```bash
pip install pyarrow==14.0.2 --force-reinstall -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install "numpy<2" --force-reinstall -i https://pypi.tuna.tsinghua.edu.cn/simple/
```

接下来把conda环境同步给其它服务器（参考之前打包vllm的步骤）