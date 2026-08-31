#!/usr/bin/env python3
"""
淘宝商品搜索脚本
通过淘宝联盟API搜索商品，返回结构化商品列表
"""

import os
import sys
import json
import time
import hashlib
import urllib.parse
import argparse
from typing import Optional, Dict, Any, List

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


def taobao_search(
    keywords: str,
    sort: str = "total_sales",
    page_no: int = 1,
    page_size: int = 20,
    min_price: float = None,
    max_price: float = None,
    has_coupon: bool = False
) -> Dict[str, Any]:
    """
    调用淘宝联盟API搜索商品
    
    Args:
        keywords: 搜索关键词
        sort: 排序方式 (total_sales/price_asc/price_desc/rebate_ratio)
        page_no: 页码
        page_size: 每页数量
        min_price: 最低价格
        max_price: 最高价格
        has_coupon: 是否仅显示有优惠券的商品
    
    Returns:
        包含商品列表的字典
    """
    
    # 排序映射
    sort_mapping = {
        "total_sales": "2",
        "price_asc": "3",
        "price_desc": "4",
        "rebate_ratio": "5"
    }
    
    # 请求参数
    params = {
        "method": "taobao.tbk.dg.material.optional.upgrade",
        "app_key": APP_KEY,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "v": "2.0",
        "sign_method": "md5",
        "format": "json",
        "q": keywords,
        "page_no": str(page_no),
        "page_size": str(page_size),
        "sort": sort_mapping.get(sort, "2")
    }
    
    # 添加推广位ID
    if ADZONE_ID:
        params["adzone_id"] = ADZONE_ID
    
    # 添加价格筛选
    if min_price:
        params["start_price"] = str(int(min_price))
    if max_price:
        params["end_price"] = str(int(max_price))
    
    # 有优惠券筛选
    if has_coupon:
        params["has_coupon"] = "true"
    
    # 生成签名
    params["sign"] = generate_sign(APP_SECRET, params)
    
    try:
        # 发送请求
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
        
        # 检查API错误
        if "error_response" in data:
            error = data["error_response"]
            return {
                "status": "error",
                "message": f"API错误: {error.get('msg', '未知错误')}",
                "code": error.get('code')
            }
        
        # 解析响应
        result = data.get("tbk_dg_material_optional_upgrade_response", {})
        if result:
            result_data = result.get("result_list", {})
            total_results = result.get("total_results", 0)
            
            products = []
            for item in result_data.get("map_data", []):
                # 提取商品信息
                basic_info = item.get("item_basic_info", {})
                price_info = item.get("price_promotion_info", {})
                
                # 使用 zk_final_price 作为展示价格（更接近实际）
                display_price = price_info.get("zk_final_price", price_info.get("final_promotion_price", ""))
                
                product = {
                    "item_id": item.get("item_id", ""),
                    "title": basic_info.get("title", ""),
                    "short_title": basic_info.get("short_title", ""),
                    "pict_url": basic_info.get("pict_url", ""),
                    "reserve_price": price_info.get("reserve_price", ""),
                    "zk_final_price": price_info.get("zk_final_price", ""),
                    "final_promotion_price": price_info.get("final_promotion_price", ""),
                    "display_price": display_price,  # 用于展示的价格
                    "volume": basic_info.get("volume", 0),
                    "shop_title": basic_info.get("shop_title", ""),
                    "category_name": basic_info.get("category_name", ""),
                    "provcity": basic_info.get("provcity", ""),
                    "commission_type": item.get("commission_type", ""),
                    "click_url": item.get("publish_info", {}).get("click_url", "").replace("//", "https://"),
                }
                
                # 优惠券信息
                coupon_share_url = item.get("publish_info", {}).get("coupon_share_url", "")
                if coupon_share_url:
                    product["coupon_share_url"] = coupon_share_url
                
                products.append(product)
            
            return {
                "status": "success",
                "total_results": total_results,
                "page_no": page_no,
                "page_size": page_size,
                "products": products
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
    parser = argparse.ArgumentParser(description="淘宝联盟商品搜索")
    parser.add_argument("--keywords", required=True, help="搜索关键词")
    parser.add_argument("--sort", default="total_sales", 
                        choices=["total_sales", "price_asc", "price_desc", "rebate_ratio"],
                        help="排序方式")
    parser.add_argument("--page_no", type=int, default=1, help="页码")
    parser.add_argument("--page_size", type=int, default=20, help="每页数量")
    parser.add_argument("--min_price", type=float, help="最低价格")
    parser.add_argument("--max_price", type=float, help="最高价格")
    parser.add_argument("--has_coupon", action="store_true", help="仅显示有优惠券商品")
    
    args = parser.parse_args()
    
    result = taobao_search(
        keywords=args.keywords,
        sort=args.sort,
        page_no=args.page_no,
        page_size=args.page_size,
        min_price=args.min_price,
        max_price=args.max_price,
        has_coupon=args.has_coupon
    )
    
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
