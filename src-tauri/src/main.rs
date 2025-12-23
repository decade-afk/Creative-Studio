/*
 * Creative Studio - 应用启动入口
 *
 * 这是Tauri桌面应用的主入口文件
 */

// 防止在Windows Release版本中显示额外的控制台窗口
// 警告：请勿删除此行！否则会在Windows上显示黑色命令行窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 调用lib.rs中的run函数启动应用
    tauri_app_lib::run()
}
