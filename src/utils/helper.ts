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
  // const perDeviceCoord: { [key: string]: [number, number][] } = {};

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

    // if (perDeviceCoord[elm.hash_id]) {
    //   perDeviceCoord[elm.hash_id] = [[elm.longitude, elm.latitude]];
    //   // perDeviceTime[elm.hash_id] = [elm.timestamp];
    // } else {
    //   perDeviceCoord[elm.hash_id].push([elm.longitude, elm.latitude]);
    //   // perDeviceTime[elm.hash_id].push(elm.timestamp);
    // }

    heatPoints.push(new Feature(new OlPoint([el.longitude, el.latitude]).transform('EPSG:4326', 'EPSG:3857')));
  });

  const perDevice: { [key: string]: { [key: string]: FeatureCollection<Point> } } = {};
  // Object.keys(perDeviceCoord).map((hash) => {
  //   perDevice[hash] = points(perDeviceCoord[hash]);
  // });

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
  // let count1 = 0;
  // let count2 = 0;
  const polygonGeoJSON = polygon([coord]);
  // Object.keys(perDevice).map((hash) => {
  //   const ptsWithin = pointsWithinPolygon(perDevice[hash], polygonGeoJSON);
  //   if (ptsWithin.features.length == 1) count1++;
  //   if (ptsWithin.features.length > 1) count2++;
  // });
  // return `${count1}/${count2}`;

  const data: { timestamp: number; Only_1: number; More_1: number }[] = [];
  Object.keys(perDevice).map((timestamp) => {
    let Only_1 = 0,
      More_1 = 0;
    Object.keys(perDevice[timestamp]).map((hash) => {
      const count = pointsWithinPolygon(perDevice[timestamp][hash], polygonGeoJSON).features.length;
      if (count == 1) Only_1++;
      if (count > 1) More_1++;
    });
    data.push({ timestamp: Number(timestamp), Only_1, More_1 });
  });

  return data;
};

export const convertGeoJSON = (features: Feature[]) => {
  const format = new GeoJSON({ featureProjection: 'EPSG:3857' });
  return format.writeFeaturesObject(features);
};

export const formatEpoch = (epoch: React.Key, timezone: string) => {
  return dayjs.unix(Number(epoch)).tz(timezone).format('HH:mm');
};
