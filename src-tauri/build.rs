/**
 * Tauri 构建脚本
 *
 * 这个文件在编译Tauri应用之前执行
 * 主要用于：
 * - 生成必要的构建时代码
 * - 处理资源文件（图标、配置等）
 * - 设置编译条件和环境变量
 *
 * 由Cargo自动调用，无需手动执行
 */
fn main() {
    // 暂时禁用 protobuf-src（依赖 LanceDB 时需要）
    // 设置 protoc 路径供 lance-encoding 使用
    // protobuf-src 会自动编译 protoc
    // let protoc_path = protobuf_src::protoc();
    // let include_path = protobuf_src::include();

    // 打印路径信息用于调试
    // println!("cargo:warning=PROTOC path: {}", protoc_path.display());
    // println!("cargo:warning=PROTOC_INCLUDE path: {}", include_path.display());

    // 设置环境变量供依赖的 build.rs 使用
    // std::env::set_var("PROTOC", &protoc_path);
    // std::env::set_var("PROTOC_INCLUDE", &include_path);

    // prost-build 和 lance-encoding 使用的环境变量
    // std::env::set_var("PROTOBUF_LOCATION", &include_path);
    // std::env::set_var("PROST_PROTOBUF_INCLUDE", &include_path);

    // 告诉 cargo 这些路径
    // println!("cargo:rustc-env=PROTOC={}", protoc_path.display());
    // println!("cargo:rustc-env=PROTOC_INCLUDE={}", include_path.display());
    // println!("cargo:rustc-env=PROTOBUF_LOCATION={}", include_path.display());

    // 使用 rerun-if-env-changed 确保环境变量变化时重新构建
    // println!("cargo:rerun-if-env-changed=PROTOC");
    // println!("cargo:rerun-if-env-changed=PROTOC_INCLUDE");
    // println!("cargo:rerun-if-env-changed=PROTOBUF_LOCATION");

    // 调用Tauri的构建系统
    // 这会：
    // 1. 读取tauri.conf.json配置
    // 2. 处理应用图标
    // 3. 生成必要的元数据
    // 4. 设置编译标志
    tauri_build::build()
}
