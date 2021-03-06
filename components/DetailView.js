import { useState } from 'react';
import { Progress, Result, Slider, Collapse, Radio, Tooltip, Table, Select} from 'antd';
import { ShrinkOutlined, AreaChartOutlined, SlidersOutlined } from '@ant-design/icons';
import { observable, action, makeObservable, computed } from 'mobx';
import { observer } from "mobx-react"
import { range, every, uniq, xor, min, max, forEach } from 'lodash';
const { Column, ColumnGroup } = Table;
const { Panel } = Collapse;
const { Option } = Select;

import dm from '../models/DataManager';
import State from '../models/State';
import { nn } from '../utils/utils';
import RenderImages from './RenderImages';
import { CORRECT_COLOR, INCORRECT_COLOR, colors} from '../style/colors';

const ModeSelector = observer(({ record, currentState }) => {
  let current_mode = currentState.modes[record.key];
  const isControl = typeof(record.children) != 'undefined';

  if (isControl) {
    // const childrenModes = record.children.map(({ key }) => currentState.modes[key]);
    // if ((new Set(childrenModes)).size == 1) {
    //   current_mode = childrenModes[0];
    // }
    return null;
  }

  const allowHeatmap = (!isControl && Object.values(currentState.modes).filter(x=> x === 'heatmap').length < 2) || current_mode === 'heatmap'

  return <Radio.Group
    optionType="button"
    buttonStyle="solid"
    size='medium'
    onChange={action(e => {
      const v = e.target.value;
      if (isControl) {
        for (const k of Object.keys(currentState.modes)) {
          if (k.startsWith(record.key)) {
            currentState.modes[k] = v
          }
        }
      } else {
        currentState.modes[record.key] = v;
      }
    })}
    value={current_mode}
  >
      <Radio.Button value="heatmap" size='large' disabled={!allowHeatmap}>
        <Tooltip title="Heat map parameter">
          <AreaChartOutlined />
        </Tooltip>
      </Radio.Button>
      <Radio.Button value="slider">
        <Tooltip title="Select value with slider">
          <SlidersOutlined />
        </Tooltip>
      </Radio.Button>
      <Radio.Button value="aggregate">
        <Tooltip title="Aggregate all samples">
          <ShrinkOutlined />
        </Tooltip>
      </Radio.Button>
  </Radio.Group>
})

const SliderControl = observer(({ record, currentState }) => {
  const isControl = typeof(record.children) != 'undefined';
  if (isControl) {
    return null;
  }

  const { key } = record;

  if (currentState.modes[key] !== 'slider') {
    return null;
  }
  const ix = dm.data.parameters.indexOf(key);
  const all_values = dm.possibleValues[ix]
  const max_value = max(all_values);
  const min_value = min(all_values);
  if (isNaN(max_value)) {
    return <Select value={currentState.sliderValues[key]} onChange={action((x) => {
      currentState.sliderValues[key] = x
    })}>
      {all_values.map(x => <Option key={x} value={x}>{x}</Option>)}
    </Select>
  } else {
    const marks = Object.fromEntries(all_values.map(x => [x, '']))


    return <Slider value={currentState.sliderValues[key]}
      marks={marks} step={null} min={min_value} max={max_value}
      onChange={action((x) => {
        currentState.sliderValues[key] = x;
    })}/>
  }
});

const RenderControls = ({ currentState }) => {

  const dd = dm.data;
  const parameters = dm.data.parameters.filter(key => key.startsWith('render_args') || key === 'model' || key === 'environment')
  const pre_result = {}

  const all_controls = Object.values(parameters).filter(key => {
    const ix = dm.data.parameters.indexOf(key);
    const all_values = dm.possibleValues[ix]
    return all_values.length > 1;
  });


  for (const parameter of all_controls) {
    const [control_name, param_name] = parameter.replace('render_args.', '').split('.')
    if (control_name === 'model' || control_name === 'environment') {
      param_name = control_name;
      control_name = "Scene"
    }
    if (typeof(pre_result[control_name]) === 'undefined') {
      pre_result[control_name] = {
        key: control_name,
        control: control_name.replace('Control', ''),
        param: '',
        children: []
      };
    }

    pre_result[control_name].children.push({
      key: parameter,
      control: '',
      param: param_name,
    })
  }

  const allParams = Object.values(pre_result)

  return <>
    <Table dataSource={allParams} bordered size="small" pagination={false}>
    <Column title="Control" dataIndex="control" key="control" width="175px"/>
    <Column title="Parameter" dataIndex="param" key="param" width="100px"/>
    <Column title="Mode" dataIndex="age" key="age" width="160px"
      render={(_, record) => <ModeSelector record={record} currentState={currentState} />}
    />
    <Column title="Filter" key="address"
      render={(_, item) => <SliderControl record={item} currentState={currentState} />}
    />
  </Table>
  </>
}


const HeatMap = observer(({ currentState }) => {
  const { heatMapAxes } = currentState;

  if (heatMapAxes.length != 2) {
    return <Result
        status="info"
        title="Info"
        subTitle="You need to have exactly two parameters in heatmap mode to enable this display"
    />
  }

  const data = currentState.heatMapData;

  const [ x_bins, y_bins] = currentState.heatMapBins;

  const binCounts = x_bins.map(x => y_bins.map(y => 0));
  const correctCounts = x_bins.map(x => y_bins.map(y => 0));

  for (const [x_value, y_value, is_correct] of data) {
    const x_bin = nn(x_bins, x_value);
    const y_bin = nn(y_bins, y_value);
    binCounts[x_bin][y_bin]++;
    if (is_correct) {
      correctCounts[x_bin][y_bin]++;
    }
  }

  return <>
    <div style={{ width:'100%', height:'100%',  backgroundColor: 'white',
                  padding: '15px 15px 20px 30px'
    }}>
      <p>Click any cell to see the corresponding images</p>
      <table style={{ width: '100%', height: 'calc(100% - 50px)', borderSpacing: '0px', borderCollapse: 'separate',
        textAlign: 'center', color: 'white', fontWeight:'bold'
      }}>
        {y_bins.map((y_value, y) => (
          <tr key={`row${y}`}>
            {x_bins.map((x_value, x) => {
              const accuracy = correctCounts[x][y] / binCounts[x][y];
              let currentlySelected = false;
              if (currentState.selectedHeatMapCell !== null) {
                console.log('ok');
                const [cx, cy] = currentState.selectedHeatMapCell;
                if (cx === x && cy === y) {
                  currentlySelected = true;
                }
              }
              return <>
                <Tooltip
                  arrowPointAtCenter
                  title={() => <>
                      {correctCounts[x][y]}/{binCounts[x][y]} ({(accuracy * 100).toFixed(1)}%) correct <br/>
                      {heatMapAxes[0].split('.')[1]}={x_value.toPrecision(6)} <br/>
                      {heatMapAxes[1].split('.')[1]}={y_value.toPrecision(6)} <br/>

                      </>}>
                  <td
                  style={{backgroundColor: colors[Math.round(accuracy * (colors.length - 1))],
                    cursor:'pointer',
                  border: `3px solid ${currentlySelected ? 'black' : 'white'}`}}
                    key={`col${x}`}
                    width={`${100/x_bins.length}%`}
                    onClick={action(() => {
                        if(currentlySelected) {
                            currentState.selectedHeatMapCell = null;
                        } else {
                            currentState.selectedHeatMapCell = [x, y];
                        }
                    })}
                  >
                    {Math.round(accuracy * 100)}%
                  </td>
                </Tooltip>
              </>
            })}
          </tr>
        ))}
      </table>
      <div style={{ position: 'absolute', bottom: '15px', width:'100%', textAlign:'center', height: '20px'}}>
        {heatMapAxes[0].replace('render_args.', '')}
      </div>
      <div style={{ position: 'absolute', top: 0, height:'100%', textAlign:'center', width: '20px', }}>
        <div style={{ position: 'absolute', bottom: '50%', transform: 'rotate(-90deg) translateY(-125px)',
          transformOrigin: '50% 0', width:'200px'
        }}>
        {heatMapAxes[1].replace('render_args.', '')}
        </div>
      </div>
    </div>
  </>
})

// const CorrectBar = observer(({ currentState }) => {
//   return (
    // <div style={{ backgroundColor: 'white', padding: '15px 15px 15px 15px' }}>
    //   <Progress
        // strokeWidth={20}
        // percent={(currentState.filteredAccuracy * 100).toPrecision(2)}
        // status="active"
    //   />
    // </div>
//   );
// });

const Main = () => {
  const [ currentState, setCurrentState ] = useState(null);

  if (currentState === null) {
    setCurrentState(new State());
  } else {
    currentState.update();
  }
  return <>
    <div style={{ position: 'relative', backgroundColor: 'white', minHeight:'250px' }}>
      <div style={{ width: '50%', display: 'inline-block', padding: '20px'}}>
        <RenderControls currentState={currentState} />
      </div>

      <div style={{ width: '50%', display: 'block', position:'absolute', paddingLeft: '10px', height: '100%', top: 0, right: 0}}>
        <HeatMap currentState={currentState} />
      </div>
    </div>
    {/* <CorrectBar currentState={currentState} /> */}
    <RenderImages currentState={currentState} />

  </>
}

export default Main;
