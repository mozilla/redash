import React, { useState } from 'react';
import { Table, Input, InputNumber, Popconfirm, Form } from 'antd';
//import { TableMetadata } from "@/components/proptypes";
import TableVisibilityCheckbox from "./TableVisibilityCheckbox";
import SampleQueryList from "./SampleQueryList";

import "./schema-table.css";

const { TextArea } = Input;

const fetchTableData = (schema) => {
  return schema.map(tableData => ({
    id: tableData.id,
    name: tableData.name,
    description: tableData.description || "",
    visible: tableData.visible,
    columns: tableData.columns,
    sample_queries: tableData.sample_queries || {},
  }));
}

const EditableCell = ({
  editing,
  dataIndex,
  title,
  inputType,
  record,
  index,
  children,
  ...restProps
}) => {
  const [data, setData] = useState(record);

  const onVisibilityCheckboxChanged = () => {
    let newRecord = Object.assign({}, record);
    newRecord.visible = !record.visible;
    setData(newRecord);
  };

  const getInput = (inputType, record) => {
    if (inputType=== "visible") {
      return <TableVisibilityCheckbox visible={record.visible} onChange={onVisibilityCheckboxChanged}/>;
    } else if (inputType === "sample_queries") {
      return <SampleQueryList />;
    }
    return <TextArea className="table-textarea" placeholder="Enter description..." style={{ resize: "vertical" }} />;
  };

  return (
    <td {...restProps}>
      {editing ? (
        <Form.Item style={{ margin: 0 }} name={[dataIndex, record.id]} initialValue={record[dataIndex]}>
          {getInput(inputType, record)}
        </Form.Item>
      ) : (
        children
      )}
    </td>
  );
};

export const SchemaTable = (props) => {
  if (!props.schema) {
    return <div></div>;
  }
  let tableData = fetchTableData(props.schema);
  const [form] = Form.useForm();
  const [data, setData] = useState(tableData);
  const [editingKey, setEditingKey] = useState('');

  const isEditing = (record) => record.id === editingKey;

  const edit = (record) => {
    setEditingKey(record.id);
  };

  const cancel = () => {
    setEditingKey('');
  };

  const save = async (tableKey, columnKey) => {
    try {
      const row = await form.validateFields();
      const newData = [...data];
      const spliceIndex = newData.findIndex(item => tableKey === item.id);

      if (spliceIndex < 0) {
        return;
      }

      const tableRow = newData[spliceIndex];
      let rowToUpdate = tableRow;

      const columnIndex = tableRow.columns.findIndex(item => columnKey === item.id);
      const columnRow = tableRow.columns[columnIndex];
      if (columnKey) {
        spliceIndex = columnIndex;
        rowToUpdate = columnRow;
      }

      // NEED TO FIND EDITED FIELDS
      props.updateSchema(row, tableRow.id, columnRow ? columnRow.id : undefined);
      setData(newData);
      setEditingKey('');
    } catch (errInfo) {
      console.log('Validate Failed:', errInfo);
    }
  };

  const truncateDescriptionText = text => {
    if (!text) {
      return;
    }
    const MAX_CHARACTER_COUNT = 305;
    const addEllipses = text.length > MAX_CHARACTER_COUNT;
    return (
      <div title={text}>
        {`${text.replace(/\n/g, " ").substring(0, MAX_CHARACTER_COUNT)}${addEllipses ? "..." : ""}`}
      </div>
    );
  };

  const columns = [
    {
      title: "Table Name",
      dataIndex: "name",
      width: "18%",
      key: "name",
    },
    {
      title: "Table Description",
      dataIndex: "description",
      width: "36%",
      key: "description",
      editable: true,
      render: truncateDescriptionText,
    },
    {
      title: "Sample Queries",
      dataIndex: "sample_queries",
      width: "24%",
      key: "sample_queries",
      editable: true,
      render: text => {
        return (
        <ul style={{ margin: 0, paddingLeft: "15px" }}>
          {Object.values(text).map(query => (
            <li key={query.id}>
              <a target="_blank" rel="noopener noreferrer" href={`queries/${query.id}/source`}>
                {query.name}
              </a>
            </li>
          ))}
        </ul>
      )},
    },
    {
      title: "Visibility",
      dataIndex: "visible",
      width: "10%",
      key: "visible",
      editable: true,
      render: (text, record) => (
        <div>
          <TableVisibilityCheckbox disabled visible={record.visible} />
        </div>
      ),
    },
    {
      title: "",
      width: "12%",
      dataIndex: "edit",
      key: "edit",
      // Purposely calling fieldEditor() instead of setting render() to it
      // because render() will pass a different third argument than what
      // fieldEditory() takes
      render: (text, record) => fieldEditor(text, record),
    },
  ];

  const fieldEditor = (text, record, tableData) => {
    const editable = isEditing(record);
    const tableKey = tableData ? tableData.id : record.id;
    const columnKey = tableData ? record.id : undefined;
    return editable ? (
      <span>
        <a
          href="javascript:;"
          onClick={() => save(tableKey, columnKey)}
          style={{
            marginRight: 8
          }}
        >
          Save
        </a>
        <Popconfirm title="Sure to cancel?" onConfirm={cancel}>
          <a>Cancel</a>
        </Popconfirm>
      </span>
     ) : (
      <a disabled={editingKey !== ''} onClick={() => edit(record)}>
        Edit
      </a>
    );
  };

  const mergedColumns = columns.map((col) => {
    if (!col.editable) {
      return col;
    }

    return {
      ...col,
      onCell: (record) => ({
        record,
        inputType: col.dataIndex,
        dataIndex: col.dataIndex,
        title: col.title,
        editing: col.editable ? isEditing(record) : false,
      }),
    };
  });
  return (
    <Form form={form} component={false}>
      <Table
        components={{
          body: {
            cell: EditableCell,
          },
        }}
        bordered
        dataSource={data}
        columns={mergedColumns}
        rowClassName="editable-row"
        pagination={{
          onChange: cancel,
        }}
        side="middle"
      />
    </Form>
  );
};
