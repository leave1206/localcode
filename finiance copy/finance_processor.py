import pandas as pd
import os
from typing import Dict, List, Tuple, Optional

# 字段映射关系定义
FIELD_MAPPINGS = {
    'historydetail7269.xlsx': {
        '对方抬头': '对方单位',
        '借方金额': ['发生额', '借贷标志'],  # 需要根据借贷标志处理
        '贷方金额': ['发生额', '借贷标志'],  # 需要根据借贷标志处理
        '交易时间': '交易时间',
        '用途': ['用途', '摘要'],  # 合并这两个字段
        '备注': '附言'
    },
    'mingxichaxun_2025051634793.xlsx': {
        '对方抬头': '对方户名',
        '借方金额': '借方发生额',
        '贷方金额': '贷方发生额',
        '交易时间': '交易时间',
        '用途': '摘要',
        '备注': '备注'
    },
    'mingxichaxun_2025062789974.xlsx': {
        '对方抬头': '对方户名',
        '借方金额': '借方发生额',
        '贷方金额': '贷方发生额',
        '交易时间': '交易时间',
        '用途': '摘要',
        '备注': '备注'
    },
    '保证金账户明细查询_20250516110806.xls': {
        '对方抬头': '对方账号',
        '借方金额': '借方',
        '贷方金额': '贷方',
        '交易时间': '交易日期',
        '用途': '摘要',
        '备注': '交易方式'
    },
    '杭州银行交易明细报表_202505161104272U1j4h.xls': {
        '对方抬头': '对手方别名',
        '借方金额': '支出金额（元）',
        '贷方金额': '收入金额（元）',
        '交易时间': '交易时间',
        '用途': '摘要',
        '备注': '附言（用途）'
    },
    '活期账户交易明细查询2025051611074527.xlsx': {
        '对方抬头': '对方账号名称',
        '借方金额': '借方发生额',
        '贷方金额': '贷方发生额',
        '交易时间': '交易时间',
        '用途': '客户附言',
        '备注': '客户附言'
    }
}

def get_file_type(filename: str) -> str:
    """
    根据文件名特征判断文件类型
    """
    filename_lower = filename.lower()
    
    if '保证金账户明细查询' in filename:
        return '保证金账户明细查询'
    elif '活期账户交易明细查询' in filename:
        return '活期账户交易明细查询'
    elif 'mingxichaxun' in filename_lower or '明细查询' in filename:
        return '明细查询'
    elif '杭州银行交易明细报表' in filename:
        return '杭州银行交易明细报表'
    elif 'historydetail' in filename_lower:
        return 'historydetail'
    else:
        # 尝试通过表头特征识别
        return 'unknown'

def get_mapping_by_type(file_type: str) -> Dict[str, str]:
    """
    根据文件类型返回对应的字段映射
    """
    mappings = {
        'historydetail': {
            '对方抬头': '对方单位',
            '借方金额': ['发生额', '借贷标志'],
            '贷方金额': ['发生额', '借贷标志'],
            '交易时间': '交易时间',
            '用途': ['用途', '摘要'],
            '备注': '附言'
        },
        '明细查询': {
            '对方抬头': '对方户名',
            '借方金额': '借方发生额',
            '贷方金额': '贷方发生额',
            '交易时间': '交易时间',
            '用途': '摘要',
            '备注': '备注'
        },
        '保证金账户明细查询': {
            '对方抬头': '对方户名',
            '借方金额': '借方',
            '贷方金额': '贷方',
            '交易时间': '交易日期',
            '用途': '摘要',
            '备注': '交易方式'
        },
        '杭州银行交易明细报表': {
            '对方抬头': '对手方别名',
            '借方金额': '支出金额（元）',
            '贷方金额': '收入金额（元）',
            '交易时间': '交易时间',
            '用途': '摘要',
            '备注': '附言（用途）'
        },
        '活期账户交易明细查询': {
            '对方抬头': '对方账号名称',
            '借方金额': '借方发生额',
            '贷方金额': '贷方发生额',
            '交易时间': '交易时间',
            '用途': '客户附言',
            '备注': '客户附言'
        }
    }
    return mappings.get(file_type, {})

def find_header_row(df: pd.DataFrame, filename: str) -> Tuple[int, pd.DataFrame]:
    """
    查找真实的表头行
    """
    file_type = get_file_type(filename)
    
    # 特殊文件处理
    if file_type == '保证金账户明细查询':
        header_row = 5
        if '交易日期' in df.iloc[header_row].values:
            new_df = pd.DataFrame(df.values[header_row+1:], columns=df.iloc[header_row])
            if '序号' in new_df.columns:
                new_df = new_df.dropna(subset=['序号'])
            return header_row, new_df
        else:
            print("警告：保证金账户明细查询文件格式异常")
            return 0, df
    elif file_type == '活期账户交易明细查询':
        # 自动查找包含关键字的表头行
        keywords = ['交易时间', '借方发生额', '贷方发生额', '对方账户名称', '摘要', '用途']
        for i in range(30):
            row = df.iloc[i] if i < len(df) else None
            if row is None:
                continue
            row_values = set(str(x).strip() for x in row.values if pd.notna(x))
            row_text = ''.join(row_values)
            if all(kw in row_text for kw in ['交易时间', '借方发生额', '贷方发生额']):
                # 这一行就是表头
                new_df = pd.DataFrame(df.values[i+1:], columns=df.iloc[i])
                return i, new_df
        # 如果没找到，默认第10行
        return 9, pd.DataFrame(df.values[10:], columns=df.iloc[9])
    elif file_type == '明细查询':
        return 2, pd.DataFrame(df.values[3:], columns=df.iloc[2])
    
    # 检查前15行，找到最可能的表头行
    for i in range(15):
        row = df.iloc[i] if i < len(df) else None
        if row is None:
            continue
        row_values = set(str(x).strip() for x in row.values if pd.notna(x))
        row_text = ''.join(row_values).lower()
        keywords = {'序号', '交易日期', '金额', '摘要', '账号', '余额', '对方', '借方', '贷方', '发生额', '交易时间'}
        if any(keyword in row_text for keyword in keywords):
            new_df = pd.DataFrame(df.values[i+1:], columns=df.iloc[i])
            return i, new_df
    
    return 0, df

def clean_column_names(df: pd.DataFrame) -> pd.DataFrame:
    """
    清理列名，删除特殊字符和空格
    """
    df.columns = [str(col).strip().replace('\n', '').replace('\r', '') for col in df.columns]
    return df

def clean_dataframe(df: pd.DataFrame, filename: str) -> pd.DataFrame:
    """
    清理DataFrame，删除空行和无意义的行
    """
    # 查找表头行并重新设置DataFrame
    header_row, df = find_header_row(df, filename)
    
    # 清理列名
    df = clean_column_names(df)
    
    # 特殊处理保证金账户明细查询文件
    if '保证金账户明细查询' in filename:
        # 删除序号为空的行
        if '序号' in df.columns:
            df = df.dropna(subset=['序号'])
            # 确保序号是数字
            df['序号'] = pd.to_numeric(df['序号'], errors='coerce')
            df = df.dropna(subset=['序号'])
            # 删除序号重复的行
            df = df.drop_duplicates(subset=['序号'])
        # 只保留交易日期为8位数字且借方或贷方有值的行
        if '交易日期' in df.columns:
            df = df[df['交易日期'].astype(str).str.match(r'^\d{8}$', na=False)]
            if '借方' in df.columns and '贷方' in df.columns:
                df = df[(df['借方'].notna() & (df['借方'].astype(str).str.strip() != '')) |
                        (df['贷方'].notna() & (df['贷方'].astype(str).str.strip() != ''))]
    
    # 删除全为空的行
    df = df.dropna(how='all')
    
    # 删除全为空字符串的行
    df = df[~df.astype(str).apply(lambda x: x.str.strip().eq('').all(), axis=1)]
    
    # 如果有序号列，尝试将其转换为数字并过滤
    number_cols = ['序号', '流水号']
    for col in number_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
            df = df.dropna(subset=[col])
            break
    
    return df

def process_special_fields(df: pd.DataFrame, source_cols: List[str], file_name: str, target_col: str = None) -> pd.Series:
    """
    处理特殊字段，如根据借贷标志处理金额
    target_col: 指定要处理借方金额还是贷方金额
    """
    if file_name.startswith('historydetail') and len(source_cols) == 2 and '借贷标志' in source_cols and target_col:
        amount_str = df[source_cols[0]].astype(str).str.replace(',', '')
        amount = pd.to_numeric(amount_str, errors='coerce')
        debit_credit = df[source_cols[1]].astype(str).str.strip()
        
        if target_col == '借方金额':
            # 借方金额：当借贷标志为"借"时，金额放在借方列
            return pd.Series([amount if flag == '借' else None for amount, flag in zip(amount, debit_credit)])
        elif target_col == '贷方金额':
            # 贷方金额：当借贷标志为"贷"时，金额放在贷方列
            return pd.Series([amount if flag == '贷' else None for amount, flag in zip(amount, debit_credit)])
    
    # 如果是用途字段需要合并
    if source_cols[0] in ['用途', '摘要'] and len(source_cols) == 2:
        return df[source_cols[0]].fillna('') + ' ' + df[source_cols[1]].fillna('')
    
    # 默认返回第一个字段
    return df[source_cols[0]] if source_cols[0] in df.columns else pd.Series([None] * len(df))

def process_excel_file(file_path: str, mapping: Dict[str, str]) -> Optional[pd.DataFrame]:
    """
    处理单个Excel文件，根据映射关系提取所需字段
    """
    try:
        # 读取Excel文件
        if file_path.endswith('.xlsx'):
            df = pd.read_excel(file_path, header=None)
        else:  # .xls文件
            df = pd.read_excel(file_path, engine='xlrd', header=None)
        
        # 获取文件类型
        file_type = get_file_type(os.path.basename(file_path))
        if file_type == 'unknown':
            print(f"警告：无法识别文件类型 {os.path.basename(file_path)}")
            return None
        
        # 使用文件类型对应的映射
        mapping = get_mapping_by_type(file_type)
        
        # 添加调试信息
        if file_type in ['保证金账户明细查询', '活期账户交易明细查询', '明细查询']:
            print(f"\n调试信息 - {file_type}文件: {os.path.basename(file_path)}")
            print(f"原始数据行数: {len(df)}")
            print("前15行数据:")
            print(df.head(15))
        
        # 清理数据框
        df = clean_dataframe(df, os.path.basename(file_path))
        
        # 添加更多调试信息
        if file_type in ['保证金账户明细查询', '活期账户交易明细查询', '明细查询']:
            print(f"\n清理后数据行数: {len(df)}")
            print("清理后的列名:", list(df.columns))
            print("前5行数据:")
            print(df.head())
        
        # 打印文件的实际列名，用于调试
        print(f"\n处理文件: {os.path.basename(file_path)}")
        print("实际列名:", list(df.columns))
        
        # 创建新的DataFrame，只包含映射的字段
        result_df = pd.DataFrame()
        
        # 特殊处理 historydetail7269 的借贷方金额
        if file_type == 'historydetail':
            # 分别处理借方和贷方金额
            result_df['借方金额'] = process_special_fields(df, ['发生额', '借贷标志'], os.path.basename(file_path), target_col='借方金额')
            result_df['贷方金额'] = process_special_fields(df, ['发生额', '借贷标志'], os.path.basename(file_path), target_col='贷方金额')
            # 其他字段
            for target_col, source_col in mapping.items():
                if target_col in ['借方金额', '贷方金额']:
                    continue
                if isinstance(source_col, list):
                    result_df[target_col] = process_special_fields(df, source_col, os.path.basename(file_path))
                else:
                    matching_cols = [col for col in df.columns if source_col.lower() in str(col).lower()]
                    if matching_cols:
                        result_df[target_col] = df[matching_cols[0]]
                    else:
                        print(f"警告: 在文件 {os.path.basename(file_path)} 中未找到字段 '{source_col}'")
                        result_df[target_col] = None
        else:
            for target_col, source_col in mapping.items():
                if isinstance(source_col, list):
                    result_df[target_col] = process_special_fields(df, source_col, os.path.basename(file_path))
                else:
                    matching_cols = [col for col in df.columns if source_col.lower() in str(col).lower()]
                    if matching_cols:
                        result_df[target_col] = df[matching_cols[0]]
                    else:
                        print(f"警告: 在文件 {os.path.basename(file_path)} 中未找到字段 '{source_col}'")
                        result_df[target_col] = None
        
        # 添加来源文件列
        result_df['数据来源'] = os.path.basename(file_path)
        
        # 数据清理
        # 处理金额列
        for col in ['借方金额', '贷方金额']:
            if col in result_df.columns:
                # 移除金额中的货币符号和逗号
                if result_df[col].dtype == object:
                    result_df[col] = result_df[col].astype(str).str.replace('¥', '').str.replace(',', '')
                result_df[col] = pd.to_numeric(result_df[col], errors='coerce')
                # 将0值替换为None
                result_df[col] = result_df[col].replace(0, None)
        
        # 确保借方和贷方金额只有一个有值
        if '借方金额' in result_df.columns and '贷方金额' in result_df.columns:
            # 如果借方金额有值，贷方金额设为None
            result_df.loc[result_df['借方金额'].notna(), '贷方金额'] = None
            # 如果贷方金额有值，借方金额设为None
            result_df.loc[result_df['贷方金额'].notna(), '借方金额'] = None
        
        # 处理日期列
        if '交易时间' in result_df.columns:
            result_df['交易时间'] = pd.to_datetime(result_df['交易时间'], errors='coerce')
        
        # 删除全为空的行
        result_df = result_df.dropna(how='all')
        
        # 打印处理结果统计
        print(f"成功提取记录数: {len(result_df)}")
        
        return result_df
    
    except Exception as e:
        print(f"处理文件 {file_path} 时出错: {str(e)}")
        return None

def main():
    # 获取当前目录
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 存储所有处理后的数据框
    all_dataframes = []
    
    print("\n=== 各文件数据提取统计 ===")
    # 处理每个文件
    for filename in os.listdir(current_dir):
        if filename.endswith(('.xlsx', '.xls')) and not filename.startswith('~$'):
            file_path = os.path.join(current_dir, filename)
            try:
                if os.path.exists(file_path):
                    # 获取文件类型和对应的映射
                    file_type = get_file_type(filename)
                    if file_type == 'unknown':
                        print(f"\n{filename}:")
                        print("无法识别文件类型")
                        continue
                        
                    mapping = get_mapping_by_type(file_type)
                    df = process_excel_file(file_path, mapping)
                    if df is not None and not df.empty:
                        all_dataframes.append(df)
                        print(f"\n{filename}:")
                        print(f"成功提取记录数: {len(df)} 条")
                else:
                    print(f"\n{filename}:")
                    print("文件不存在")
            except Exception as e:
                print(f"\n{filename}:")
                print(f"处理出错: {str(e)}")
    
    # 合并所有数据框
    if all_dataframes:
        combined_df = pd.concat(all_dataframes, ignore_index=True)
        
        # 确保所有必要的列都存在
        expected_columns = ['对方抬头', '借方金额', '贷方金额', '交易时间', '用途', '备注', '数据来源']
        missing_columns = set(expected_columns) - set(combined_df.columns)
        if missing_columns:
            print(f"\n警告: 最终汇总表缺少以下列: {missing_columns}")
        
        # 按交易时间排序
        if '交易时间' in combined_df.columns:
            combined_df = combined_df.sort_values('交易时间')
        
        # 重新排列列顺序
        columns_order = [col for col in expected_columns if col in combined_df.columns]
        combined_df = combined_df[columns_order]
        
        # 保存合并后的结果
        output_file = os.path.join(current_dir, '财务收支汇总表.xlsx')
        combined_df.to_excel(output_file, index=False)
        print(f"\n=== 汇总结果 ===")
        print(f"已成功生成汇总表: {output_file}")
        print(f"总记录数: {len(combined_df)} 条")
        print(f"包含的列: {list(combined_df.columns)}")
        
        # 打印数据统计信息
        print("\n数据统计:")
        print(f"借方金额总计: {combined_df['借方金额'].sum():,.2f}")
        print(f"贷方金额总计: {combined_df['贷方金额'].sum():,.2f}")
        print(f"日期范围: {combined_df['交易时间'].min()} 至 {combined_df['交易时间'].max()}")
        
        # 打印每个来源文件的记录数
        print("\n各文件记录数统计:")
        file_stats = combined_df['数据来源'].value_counts()
        for file_name, count in file_stats.items():
            print(f"{file_name}: {count} 条")
    else:
        print("\n没有成功处理任何文件")

if __name__ == "__main__":
    main() 