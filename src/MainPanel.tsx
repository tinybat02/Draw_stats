import React, { PureComponent } from 'react';
import { PanelProps } from '@grafana/data';
import { PanelOptions, Frame } from 'types';
import { Map, View } from 'ol';
import { XYZ, Vector as VectorSource } from 'ol/source';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import Heatmap from 'ol/layer/Heatmap';
import { fromLonLat, transform } from 'ol/proj';
import { defaults, DragPan, MouseWheelZoom, Select } from 'ol/interaction';
import { platformModifierKeyOnly, click } from 'ol/events/condition';
import Feature, { FeatureLike } from 'ol/Feature';
import { Fill, Stroke, Style, Text } from 'ol/style';
import { Draw, Modify, Snap } from 'ol/interaction';
import GeometryType from 'ol/geom/GeometryType';
import { nanoid } from 'nanoid';
import { FeatureCollection, Point } from '@turf/helpers';
import Polygon from 'ol/geom/Polygon';
import GeoJSON from 'ol/format/GeoJSON';
import { unByKey } from 'ol/Observable';
import { EventsKey } from 'ol/events';
import { ResponsiveBar } from '@nivo/bar';
import { /* processDataES,  */ processData, countUnique, convertGeoJSON, formatEpoch } from './utils/helper';
import Icon from './img/save_icon.svg';
import { jsFileDownloader } from 'js-client-file-downloader';
import './style/main.css';
import 'ol/ol.css';

interface Props extends PanelProps<PanelOptions> {}
interface State {
  isDrawing: boolean;
  featureName: string;
  selectedFeature: Feature | null;
  // chartData: Array<{ timestamp: number; Only_1: number; More_1: number }>;
  chartData: Array<{ timestamp: number; 'By Device': number }>;
  keys: string[];
}

export class MainPanel extends PureComponent<Props, State> {
  id = 'id' + nanoid();
  map: Map;
  randomTile: TileLayer;
  drawLayer: VectorLayer;
  heatLayer: Heatmap;
  draw: Draw;
  modify: Modify;
  snap: Snap;
  select: Select;
  perDevice: { [key: string]: { [key: string]: FeatureCollection<Point> } } | null = null;
  perArea: { [key: string]: { [key: string]: number } } = {};

  state: State = {
    isDrawing: true,
    featureName: '',
    selectedFeature: null,
    chartData: [],
    keys: [],
  };

  componentDidMount() {
    const {
      tile_url,
      zoom_level,
      center_lon,
      center_lat,
      heat_radius,
      heat_blur,
      heat_opacity,
      geoJSON,
    } = this.props.options;

    const carto = new TileLayer({
      source: new XYZ({
        url: 'https://{1-4}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      }),
    });

    const source = geoJSON
      ? new VectorSource<Polygon>({
          features: new GeoJSON({ featureProjection: 'EPSG:3857' }).readFeatures(this.props.options.geoJSON as object),
        })
      : new VectorSource<Polygon>();

    this.drawLayer = new VectorLayer({
      source: source,
      style: function (feature: FeatureLike) {
        const textLabel = feature.get('label');
        const textName = feature.get('name');
        return new Style({
          fill: new Fill({
            color: 'rgba(255, 255, 255, 0.2)',
          }),
          stroke: new Stroke({
            color: textName ? '#FFA500' : '#49A8DE',
            width: 2,
          }),
          text: new Text({
            stroke: new Stroke({
              color: '#fff',
              width: 2,
            }),
            font: '14px Calibri,sans-serif',
            text: textLabel,
            overflow: true,
          }),
        });
      },
      zIndex: 3,
    });

    const min = fromLonLat([center_lon - 0.02, center_lat - 0.02]);

    const max = fromLonLat([center_lon + 0.02, center_lat + 0.02]);
    const extent = [...min, ...max] as [number, number, number, number];

    this.map = new Map({
      interactions: defaults({ dragPan: false, mouseWheelZoom: false, onFocusOnly: true }).extend([
        new DragPan({
          condition: function (event) {
            return platformModifierKeyOnly(event) || this.getPointerCount() === 2;
          },
        }),
        new MouseWheelZoom({
          condition: platformModifierKeyOnly,
        }),
      ]),
      layers: [carto, this.drawLayer],
      view: new View({
        center: fromLonLat([center_lon, center_lat]),
        zoom: zoom_level,
        extent,
      }),
      target: this.id,
    });

    if (tile_url !== '') {
      this.randomTile = new TileLayer({
        source: new XYZ({
          url: tile_url,
        }),
        zIndex: 1,
      });
      this.map.addLayer(this.randomTile);
    }

    let modifiedFeatures: Feature[] = [];
    let geometryChangeListener: EventsKey | null;

    this.modify = new Modify({ source: source, pixelTolerance: 5 });
    this.map.addInteraction(this.modify);

    this.modify.on('modifystart', (e) => {
      modifiedFeatures.length = 0;
      e.features.forEach((feature) => {
        geometryChangeListener = feature.getGeometry().on('change', () => {
          if (modifiedFeatures.indexOf(feature) == -1) {
            modifiedFeatures.push(feature);
          }
        });
      });
    });

    this.modify.on('modifyend', () => {
      if (geometryChangeListener) {
        unByKey(geometryChangeListener);
        geometryChangeListener = null;
      }

      const ft = modifiedFeatures[0].getGeometry() as Polygon;

      if (this.perDevice) {
        const converted = ft.getCoordinates()[0].map((elm) => transform(elm, 'EPSG:3857', 'EPSG:4326'));
        const count = countUnique(converted as [number, number][], this.perDevice, this.perArea);
        this.setState({ chartData: count });
        // modifiedFeatures[0].set('label', count);
      }
    });

    this.draw = new Draw({
      source: source,
      type: GeometryType.POLYGON,
    });
    this.map.addInteraction(this.draw);

    this.snap = new Snap({ source: source });
    this.map.addInteraction(this.snap);

    this.drawLayer.getSource().on('addfeature', (ft) => {
      const drawFeature = ft.feature.getGeometry() as Polygon;

      if (this.perDevice) {
        const converted = drawFeature.getCoordinates()[0].map((elm) => transform(elm, 'EPSG:3857', 'EPSG:4326'));
        const countData = countUnique(converted as [number, number][], this.perDevice, this.perArea);

        this.setState({ chartData: countData });
        // ft.feature.set('label', count);
      }
    });

    this.select = new Select({ condition: click });
    this.map.addInteraction(this.select);
    this.select.on('select', (e) => {
      const selectedFeature = e.target.getFeatures().item(0);
      if (selectedFeature) {
        const name = selectedFeature.get('name') || '';
        this.setState({ selectedFeature: selectedFeature, featureName: name });
      } else {
        this.setState({ selectedFeature: null, featureName: '' });
      }
    });
    this.select.setActive(false);

    if (this.props.data.series.length > 0) {
      const series = this.props.data.series as Frame[];
      const { perDevice, perArea, heatSource, keys } = processData(series);

      this.setState({ keys });

      this.perDevice = perDevice;
      this.perArea = perArea;

      this.heatLayer = new Heatmap({
        source: heatSource,
        blur: parseInt(heat_blur, 10),
        radius: parseInt(heat_radius, 10),
        opacity: parseFloat(heat_opacity),
        zIndex: 2,
      });
      this.map.addLayer(this.heatLayer);
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.draw.getActive()) this.draw.abortDrawing();
    });
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.data.series[0] !== this.props.data.series[0]) {
      this.perDevice = null;
      this.perArea = {};
      this.map.removeLayer(this.heatLayer);

      const rawIndex = this.props.data.series.findIndex((serie) => serie.name == 'docs');

      if (this.props.data.series.length == 0 || rawIndex == -1) {
        this.setState((prevState) => ({ ...prevState, chartData: [], keys: [] }));
        return;
      }

      const { heat_blur, heat_radius, heat_opacity } = this.props.options;

      const series = this.props.data.series as Frame[];
      const { perDevice, perArea, heatSource, keys } = processData(series);
      this.setState({ keys });
      this.perDevice = perDevice;
      this.perArea = perArea;

      this.heatLayer = new Heatmap({
        source: heatSource,
        blur: parseInt(heat_blur, 10),
        radius: parseInt(heat_radius, 10),
        opacity: parseFloat(heat_opacity),
        zIndex: 2,
      });
      this.map.addLayer(this.heatLayer);

      if (this.drawLayer) {
        const features = this.drawLayer.getSource().getFeatures() as Feature<Polygon>[];
        features.forEach((feature) => {
          const coordinates = feature.getGeometry().getCoordinates() as [number, number][][];
          const converted = coordinates[0].map((elm) => transform(elm, 'EPSG:3857', 'EPSG:4326'));
          if (this.perDevice) {
            const countData = countUnique(converted as [number, number][], this.perDevice, this.perArea);
            this.setState({ chartData: countData });
            // feature.set('label', count);
          }
        });
      }
    }

    if (prevProps.options.tile_url !== this.props.options.tile_url) {
      if (this.randomTile) this.map.removeLayer(this.randomTile);

      if (this.props.options.tile_url !== '') {
        this.randomTile = new TileLayer({
          source: new XYZ({
            url: this.props.options.tile_url,
          }),
          zIndex: 1,
        });
        this.map.addLayer(this.randomTile);
      }
    }

    if (prevProps.options.zoom_level !== this.props.options.zoom_level)
      this.map.getView().setZoom(this.props.options.zoom_level);

    if (
      prevProps.options.center_lat !== this.props.options.center_lat ||
      prevProps.options.center_lon !== this.props.options.center_lon
    )
      this.map.getView().animate({
        center: fromLonLat([this.props.options.center_lon, this.props.options.center_lat]),
        duration: 2000,
      });
  }

  clearDrawLayer = () => {
    const features = this.drawLayer.getSource().getFeatures();
    features.forEach((feature) => {
      this.drawLayer.getSource().removeFeature(feature);
    });
    this.setState({ chartData: [] });
  };

  handleUndo = () => {
    const lastFeature = this.drawLayer.getSource().getFeatures().pop();
    lastFeature && this.drawLayer.getSource().removeFeature(lastFeature);
  };

  onSelectMode = () => {
    if (this.state.isDrawing) {
      this.setState({ isDrawing: false });
      this.draw.setActive(false);
      this.modify.setActive(false);
      this.snap.setActive(false);
      this.select.setActive(true);
    } else {
      this.setState({ isDrawing: true });
      this.draw.setActive(true);
      this.modify.setActive(true);
      this.snap.setActive(true);
      this.select.setActive(false);
    }
  };

  onInputName = (evt: React.ChangeEvent<HTMLInputElement>) => {
    if (this.state.selectedFeature) this.setState({ featureName: evt.target.value });
  };

  onSetName = (evt: React.FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    const { selectedFeature, featureName } = this.state;

    if (selectedFeature) {
      selectedFeature.set('name', featureName);
      selectedFeature.setStyle(
        new Style({
          stroke: new Stroke({
            color: '#FFA500',
            width: 2,
          }),
        })
      );
    }
  };

  onDownload = () => {
    if (this.drawLayer) {
      const obj = convertGeoJSON(this.drawLayer.getSource().getFeatures());
      jsFileDownloader.makeJSON(obj, 'geojson');
    }
  };

  onSaveGeoJSON = () => {
    const format = new GeoJSON({ featureProjection: 'EPSG:3857' });

    this.props.onOptionsChange({
      ...this.props.options,
      geoJSON: format.writeFeaturesObject(this.drawLayer.getSource().getFeatures()),
    });
  };

  render() {
    const {
      width,
      height,
      options: { timezone },
    } = this.props;
    const { featureName, isDrawing, chartData, keys } = this.state;

    return (
      <div style={{ width, height, position: 'relative' }}>
        <div style={{ display: 'flex', padding: 5 }}>
          <div className="gf-form-switch" style={{ border: 'none' }} onClick={this.onSelectMode}>
            <input type="checkbox" checked={!isDrawing} />
            <span className="gf-form-switch__slider"></span>
          </div>

          {isDrawing && (
            <>
              <button className="btn btn-primary btn-ext" onClick={this.clearDrawLayer}>
                Clear
              </button>
              <button className="btn btn-primary btn-ext" onClick={this.handleUndo}>
                Undo
              </button>
            </>
          )}

          {!isDrawing && (
            <>
              <form onSubmit={this.onSetName} style={{ marginLeft: '0.5em' }}>
                <input
                  value={featureName}
                  onChange={this.onInputName}
                  style={{ padding: 5, border: '1px solid #7f7f7f', borderRadius: 4 }}
                />
              </form>
              <button className="btn btn-primary icon-download" onClick={this.onSaveGeoJSON}>
                Save To Panel
              </button>
              <img src={Icon} className="icon-download" onClick={this.onDownload} />
            </>
          )}
        </div>
        <div id={this.id} style={{ width, height: height - 40 }}></div>
        {chartData.length > 0 && (
          <div
            style={{
              width: width / 3,
              height: height / 3,
              background: 'white',
              position: 'absolute',
              bottom: -5,
              right: 0,
              borderRadius: 3,
            }}
          >
            <ResponsiveBar
              data={chartData}
              keys={keys}
              indexBy="timestamp"
              margin={{ top: 20, right: 30, bottom: 30, left: 50 }}
              padding={0.15}
              groupMode="grouped"
              valueScale={{ type: 'linear' }}
              indexScale={{ type: 'band', round: true }}
              colors={{ scheme: 'nivo' }}
              borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
              axisBottom={{
                tickSize: 2,
                tickPadding: 2,
                tickRotation: -50,
                renderTick: (tick: any) => {
                  return (
                    <g transform={`translate(${tick.x},${tick.y + 22})`}>
                      <line stroke="#ccc" strokeWidth={1.5} y1={-22} y2={-12} />
                      <text
                        textAnchor="middle"
                        dominantBaseline="middle"
                        style={{
                          fontSize: 8,
                        }}
                        transform="rotate(-25)"
                      >
                        {formatEpoch(tick.value, timezone)}
                      </text>
                    </g>
                  );
                },
              }}
              axisLeft={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: 0,
              }}
              labelSkipWidth={12}
              labelSkipHeight={12}
              labelTextColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
              labelFormat={(labelValue) => ((<tspan y={-8}>{labelValue}</tspan>) as unknown) as string}
              tooltip={({ id, value, color, indexValue }) => {
                return (
                  <span
                    style={{ /* color: '#000', */ color, background: '#fff', padding: '5px 10px', borderRadius: 3 }}
                  >
                    {id} - {formatEpoch(indexValue, timezone)} : <strong>{value}</strong>
                  </span>
                );
              }}
              animate={true}
            />
          </div>
        )}
      </div>
    );
  }
}
