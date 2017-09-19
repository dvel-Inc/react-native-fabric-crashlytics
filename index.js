'use strict';

import { Platform } from 'react-native';
import StackTrace from 'stacktrace-js';
import { Crashlytics } from 'react-native-fabric';
import SourceMap from 'source-map';

function nomap(row){
  return {};
}

function init(smap) {
  if (__DEV__) {
    // Don't send exceptions from __DEV__, it's way too noisy!
    // Live reloading and hot reloading in particular lead to tons of noise...
    return;
  }

  let mapper = nomap;
  if(smap){
    const mapConsumer = new SourceMap.SourceMapConsumer(smap);
    mapper = (row)=>{
      const loc = mapConsumer.originalPositionFor({
                                  line: row.lineNumber,
                                  column: row.columnNumber,
                              });
      return loc;
    }
  }

  var originalHandler = global.ErrorUtils.getGlobalHandler();
  function errorHandler(e, isFatal) {
    StackTrace.fromError(e).then((x)=>Crashlytics.recordCustomExceptionName(e.message, e.message, x.map(row=>{
      const loc = mapper(row);
      return {
        fileName: loc.source || row.fileName,
        columnNumber: loc.column || row.columnNumber,
        lineNumber: loc.line || row.lineNumber,
        functionName: loc.source ? `${loc.name}@${loc.source} ${loc.line}:${loc.column}` :
        `${(row.source || 'unknown_func')}`, //next best thing without a consistent function name
      };
    })));
    // And then re-throw the exception with the original handler
    if (originalHandler) {
      if (Platform.OS === 'ios') {
        originalHandler(e, isFatal);
      } else {
        // On Android, throwing the original exception immediately results in the
        // recordCustomExceptionName() not finishing before the app crashes and therefore not logged
        // Add a delay to give it time to log the custom JS exception before crashing the app.
        // The user facing effect of this delay is that separate JS errors will appear as separate
        // issues in the Crashlytics dashboard.
        setTimeout(() => {
          originalHandler(e, isFatal);
        }, 500);
      }
    }
  }
  global.ErrorUtils.setGlobalHandler(errorHandler);
}

module.exports = {
  init,
}
