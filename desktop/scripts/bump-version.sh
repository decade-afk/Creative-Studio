#!/bin/bash

###############################################################################
# 版本号更新脚本
#
# 功能：
# 1. 同步更新 package.json 和 Cargo.toml 中的版本号
# 2. 创建 git commit 和 tag
# 3. 可选：推送到远程仓库触发构建
#
# 用法：
#   ./scripts/bump-version.sh <new_version>
#   例如: ./scripts/bump-version.sh 1.0.0
###############################################################################

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 帮助信息
show_help() {
    echo "用法: $0 <版本号> [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help          显示帮助信息"
    echo "  -p, --push          自动推送到远程仓库"
    echo "  -n, --no-commit     只更新文件，不创建 commit"
    echo ""
    echo "示例:"
    echo "  $0 1.0.0           # 更新版本号到 1.0.0"
    echo "  $0 1.0.1 --push    # 更新版本号并推送"
    echo ""
}

# 验证版本号格式
validate_version() {
    if [[ ! $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo -e "${RED}错误: 无效的版本号格式！${NC}"
        echo "版本号应该是 X.Y.Z 格式，例如: 1.0.0"
        exit 1
    fi
}

# 解析参数
NEW_VERSION=""
AUTO_PUSH=false
NO_COMMIT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -p|--push)
            AUTO_PUSH=true
            shift
            ;;
        -n|--no-commit)
            NO_COMMIT=true
            shift
            ;;
        *)
            if [[ -z "$NEW_VERSION" ]]; then
                NEW_VERSION=$1
            else
                echo -e "${RED}错误: 未知参数 '$1'${NC}"
                show_help
                exit 1
            fi
            shift
            ;;
    esac
done

# 检查是否提供了版本号
if [[ -z "$NEW_VERSION" ]]; then
    echo -e "${RED}错误: 请提供版本号！${NC}"
    show_help
    exit 1
fi

# 验证版本号格式
validate_version "$NEW_VERSION"

# 获取当前版本号
CURRENT_VERSION=$(node -p "require('./package.json').version")

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Creative Studio 版本更新${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "当前版本: ${YELLOW}${CURRENT_VERSION}${NC}"
echo -e "新版本:   ${GREEN}${NEW_VERSION}${NC}"
echo ""

# 确认操作
read -p "确认要更新版本号吗? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}已取消操作${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}步骤 1/5: 更新 package.json...${NC}"
# 使用 Node.js 更新 package.json
node -e "
const fs = require('fs');
const pkg = require('./package.json');
pkg.version = '$NEW_VERSION';
fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo -e "${GREEN}✓ package.json 更新完成${NC}"

echo ""
echo -e "${BLUE}步骤 2/5: 更新 Cargo.toml...${NC}"
# 使用 sed 更新 Cargo.toml
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/^version = \".*\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml
else
    # Linux
    sed -i "s/^version = \".*\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml
fi
echo -e "${GREEN}✓ Cargo.toml 更新完成${NC}"

echo ""
echo -e "${BLUE}步骤 3/5: 更新 Cargo.lock...${NC}"
# 更新 Cargo.lock
cd src-tauri
cargo update -p tauri-app
cd ..
echo -e "${GREEN}✓ Cargo.lock 更新完成${NC}"

# 如果不需要 commit，到这里就结束
if [[ "$NO_COMMIT" == true ]]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}版本号更新完成！${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo -e "已更新的文件:"
    echo -e "  - package.json"
    echo -e "  - src-tauri/Cargo.toml"
    echo -e "  - src-tauri/Cargo.lock"
    echo ""
    echo -e "${YELLOW}提示: 使用了 --no-commit 选项，未创建 git commit${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}步骤 4/5: 创建 Git commit...${NC}"
# 创建 commit
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump version to ${NEW_VERSION}"
echo -e "${GREEN}✓ Git commit 创建完成${NC}"

echo ""
echo -e "${BLUE}步骤 5/5: 创建 Git tag...${NC}"
# 创建 tag
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"
echo -e "${GREEN}✓ Git tag 创建完成${NC}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}版本号更新成功！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "已创建:"
echo -e "  ${GREEN}✓${NC} Commit: chore: bump version to ${NEW_VERSION}"
echo -e "  ${GREEN}✓${NC} Tag: v${NEW_VERSION}"
echo ""

# 是否推送到远程
if [[ "$AUTO_PUSH" == true ]]; then
    echo -e "${BLUE}正在推送到远程仓库...${NC}"
    git push origin main
    git push origin "v${NEW_VERSION}"
    echo -e "${GREEN}✓ 已推送到远程仓库${NC}"
    echo ""
    echo -e "${BLUE}GitHub Actions 将自动开始构建...${NC}"
    echo -e "查看构建进度: https://github.com/你的用户名/creative-studio/actions"
else
    echo -e "${YELLOW}下一步操作:${NC}"
    echo ""
    echo -e "  1. 推送 commit 和 tag:"
    echo -e "     ${BLUE}git push origin main${NC}"
    echo -e "     ${BLUE}git push origin v${NEW_VERSION}${NC}"
    echo ""
    echo -e "  2. 或者使用一键推送:"
    echo -e "     ${BLUE}git push origin main --tags${NC}"
    echo ""
    echo -e "  推送后，GitHub Actions 会自动构建所有平台的安装包"
fi

echo ""
