import React, { useState } from 'react';
//@ts-ignore
import { FormField, PanelOptionsGroup } from '@grafana/ui';
import { PanelEditorProps } from '@grafana/data';
import { PanelOptions } from './types';

export const MainEditor: React.FC<PanelEditorProps<PanelOptions>> = ({ options, onOptionsChange }) => {
  const [inputs, setInputs] = useState(options);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;

    setInputs((prevState) => ({
      ...prevState,
      [name]: type == 'number' ? Number(value) : value,
    }));
  };

  const handleSubmit = () => {
    onOptionsChange(inputs);
  };

  return (
    <PanelOptionsGroup>
      <div className="editor-row">
        <div className="section gf-form-group">
          <h5 className="section-heading">Map Visual Options</h5>
          <FormField
            label="Center Latitude"
            labelWidth={10}
            inputWidth={40}
            type="number"
            name="center_lat"
            value={inputs.center_lat}
            onChange={handleChange}
          />
          <FormField
            label="Center Longitude"
            labelWidth={10}
            inputWidth={40}
            type="number"
            name="center_lon"
            value={inputs.center_lon}
            onChange={handleChange}
          />
          <FormField
            label="Tile"
            labelWidth={10}
            inputWidth={40}
            type="text"
            name="tile_url"
            value={inputs.tile_url}
            onChange={handleChange}
          />
          <FormField
            label="Initial Zoom"
            labelWidth={10}
            inputWidth={40}
            type="number"
            name="zoom_level"
            value={inputs.zoom_level}
            onChange={handleChange}
          />
          <FormField
            label="Timezone"
            labelWidth={10}
            inputWidth={40}
            type="text"
            name="timezone"
            value={inputs.timezone}
            onChange={handleChange}
          />
        </div>
      </div>
      <button className="btn btn-primary" onClick={handleSubmit}>
        Submit
      </button>
    </PanelOptionsGroup>
  );
};
