#!/usr/bin/env python3
"""
淘宝推广链接转换脚本
将商品ID或优惠券链接转换为带佣金的推广链接（淘口令）
"""

import os
import sys
import json
import time
import hashlib
import urllib.parse
import argparse
from typing import Optional, Dict, Any

try:
    import http.client as httplib
except ImportError:
    import httplib


# 淘宝联盟API配置
TAOBAO_API_HOST = "eco.taobao.com"
TAOBAO_API_PORT = 80
# 固定凭证（开发者淘宝联盟）
APP_KEY = "35339625"
APP_SECRET = "38fc7d5b0f88c7074a73f9ab1a6ba55a"
ADZONE_ID = "109782150339"  # 推广位ID

def generate_sign(secret: str, parameters: Dict[str, Any]) -> str:
    """生成淘宝API签名"""
    keys = sorted(parameters.keys())
    param_str = ''.join('%s%s' % (k, str(parameters[k])) for k in keys)
    sign_str = secret + param_str + secret
    return hashlib.md5(sign_str.encode('utf-8')).hexdigest().upper()


def convert_link(item_id: str, coupon_link: str = None) -> Dict[str, Any]:
    """
    将商品ID或优惠券链接转换为淘口令/推广链接
    
    Args:
        item_id: 商品ID
        coupon_link: 优惠券链接（可选）
    
    Returns:
        包含推广链接的字典
    """
    
    if not ADZONE_ID:
        return {
            "status": "error",
            "message": "缺少PID（推广位ID），请检查配置"
        }
    
    params = {
        "method": "taobao.tbk.link.convert",
        "app_key": APP_KEY,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "v": "2.0",
        "sign_method": "md5",
        "format": "json",
        "item_numid": item_id,
        "adzone_id": ADZONE_ID
    }
    
    if coupon_link:
        params["coupon_url"] = coupon_link
    
    params["sign"] = generate_sign(APP_SECRET, params)
    
    try:
        body = urllib.parse.urlencode(params).encode('utf-8')
        conn = httplib.HTTPConnection(TAOBAO_API_HOST, TAOBAO_API_PORT, timeout=30)
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        }
        conn.request('POST', '/router/rest', body, headers)
        
        response = conn.getresponse()
        result_text = response.read().decode('utf-8')
        conn.close()
        
        data = json.loads(result_text)
        
        if "error_response" in data:
            error = data["error_response"]
            return {
                "status": "error",
                "message": f"API错误: {error.get('msg', '未知错误')}",
                "code": error.get('code')
            }
        
        result = data.get("tbk_link_convert_response", {})
        
        if result:
            return {
                "status": "success",
                "tbk_link": result.get("tbk_link", ""),
                "coupon_link": result.get("coupon_link", ""),
                "short_link_url": result.get("short_link_url", ""),
                "tao_token": result.get("tao_token", ""),
                "model": result.get("model", ""),
                "item_id": item_id
            }
        
        return {
            "status": "error",
            "message": "API响应格式异常"
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"请求失败: {str(e)}"
        }


def create_tao_password(title: str, link: str, logo: str = None) -> Dict[str, Any]:
    """
    生成淘口令
    
    Args:
        title: 商品标题
        link: 推广链接
        logo: 商品图片URL（可选）
    
    Returns:
        包含淘口令和跳转链接的字典
    """
    params = {
        "method": "taobao.tbk.tpwd.create",
        "app_key": APP_KEY,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "v": "2.0",
        "sign_method": "md5",
        "format": "json",
        "text": title[:20] + "..." if len(title) > 20 else title,
        "url": link
    }
    
    if logo:
        params["logo"] = logo
    
    params["sign"] = generate_sign(APP_SECRET, params)
    
    try:
        body = urllib.parse.urlencode(params).encode('utf-8')
        conn = httplib.HTTPConnection(TAOBAO_API_HOST, TAOBAO_API_PORT, timeout=30)
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        }
        conn.request('POST', '/router/rest', body, headers)
        
        response = conn.getresponse()
        result_text = response.read().decode('utf-8')
        conn.close()
        
        data = json.loads(result_text)
        
        if "error_response" in data:
            error = data["error_response"]
            return {
                "status": "error",
                "message": f"API错误: {error.get('msg', '未知错误')}",
                "code": error.get('code')
            }
        
        result = data.get("tbk_tpwd_create_response", {})
        if result:
            return {
                "status": "success",
                "tao_password": result.get("data", {}).get("model", ""),
                "link": link
            }
        
        return {
            "status": "error",
            "message": "API响应格式异常"
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"请求失败: {str(e)}"
        }


def main():
    parser = argparse.ArgumentParser(description="淘宝推广链接转换")
    subparsers = parser.add_subparsers(dest="command", help="子命令")
    
    # convert 子命令
    convert_parser = subparsers.add_parser("convert", help="转换商品链接")
    convert_parser.add_argument("--item_id", required=True, help="商品ID")
    convert_parser.add_argument("--coupon", help="优惠券链接")
    
    # password 子命令
    password_parser = subparsers.add_parser("password", help="生成淘口令")
    password_parser.add_argument("--title", required=True, help="商品标题")
    password_parser.add_argument("--link", required=True, help="推广链接")
    password_parser.add_argument("--logo", help="商品图片URL")
    
    args = parser.parse_args()
    
    if args.command == "convert":
        result = convert_link(args.item_id, args.coupon)
    elif args.command == "password":
        result = create_tao_password(args.title, args.link, args.logo)
    else:
        if not hasattr(args, 'item_id'):
            parser.print_help()
            sys.exit(1)
        result = convert_link(args.item_id)
    
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
