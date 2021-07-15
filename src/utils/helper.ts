import { points, polygon, FeatureCollection, Point } from '@turf/helpers';
import pointsWithinPolygon from '@turf/points-within-polygon';
import Feature from 'ol/Feature';
import OlPoint from 'ol/geom/Point';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);

interface Item {
  latitude: number;
  longitude: number;
  timestamp: number;
  hash_id: string;
  [key: string]: any;
}

export const processDataES = (data: Item[]) => {
  data.reverse();

  const heatPoints: Feature[] = [];

  let previous_pivot = 0;
  const obj: { [key: string]: { [key: string]: [number, number][] } } = {};

  data.map((el) => {
    const dividend = Math.floor(el.timestamp / 600);
    const time_pivot = dividend * 600;

    if (previous_pivot == 0 && time_pivot != previous_pivot) previous_pivot = time_pivot;

    if (time_pivot != previous_pivot && time_pivot != previous_pivot + 600)
      while (previous_pivot < time_pivot) {
        previous_pivot += 600;
        obj[previous_pivot] = {};
      }
    else if (time_pivot == previous_pivot + 600) previous_pivot = time_pivot;

    if (!obj[time_pivot]) obj[time_pivot] = {};

    if (!obj[time_pivot][el.hash_id]) obj[time_pivot][el.hash_id] = [[el.longitude, el.latitude]];
    else obj[time_pivot][el.hash_id].push([el.longitude, el.latitude]);

    heatPoints.push(new Feature(new OlPoint([el.longitude, el.latitude]).transform('EPSG:4326', 'EPSG:3857')));
  });

  const perDevice: { [key: string]: { [key: string]: FeatureCollection<Point> } } = {};

  Object.keys(obj).map((time) => {
    if (!perDevice[time]) perDevice[time] = {};
    Object.keys(obj[time]).map((hash) => {
      perDevice[time][hash] = points(obj[time][hash]);
    });
  });

  return {
    perDevice,
    heatSource: new VectorSource({
      features: heatPoints,
    }),
  };
};

export const countUnique = (
  coord: [number, number][],
  perDevice: { [key: string]: { [key: string]: FeatureCollection<Point> } }
) => {
  const polygonGeoJSON = polygon([coord]);
  // const data: { timestamp: number; Only_1: number; More_1: number }[] = [];
  const data: { timestamp: number; Customers: number }[] = [];
  Object.keys(perDevice).map((timestamp) => {
    let Customers = 0;
    /* Only_1 = 0,
      More_1 = 0; */
    Object.keys(perDevice[timestamp]).map((hash) => {
      const count = pointsWithinPolygon(perDevice[timestamp][hash], polygonGeoJSON).features.length;
      // if (count == 1) Only_1++;
      // if (count > 1) More_1++;
      if (count >= 1) Customers++;
    });
    data.push({ timestamp: Number(timestamp), Customers });
  });

  return data.slice(-18);
};

export const convertGeoJSON = (features: Feature[]) => {
  const format = new GeoJSON({ featureProjection: 'EPSG:3857' });
  return format.writeFeaturesObject(features);
};

export const formatEpoch = (epoch: React.Key, timezone: string) => {
  return dayjs.unix(Number(epoch)).tz(timezone).format('HH:mm');
};
