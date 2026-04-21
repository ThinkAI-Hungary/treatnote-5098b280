import { ToothModel } from './types';
import { ADULT_TEETH, BABY_TEETH } from './constants';
import { Tooth } from './Tooth';

type Props = {
  data: Record<string, ToothModel>;
  onToothClick: (toothNumber: string) => void;
  showBabyTeeth: boolean;
};

export function ZsigmondyCross({ data, onToothClick, showBabyTeeth }: Props) {
  
  const renderRow = (leftNumbers: string[], rightNumbers: string[]) => (
    <div className="flex justify-center items-center gap-1 sm:gap-2 w-max mx-auto flex-nowrap">
      <div className="flex gap-1 sm:gap-2 justify-end flex-nowrap items-center w-max">
        {leftNumbers.map(num => (
          <Tooth 
            key={num} 
            number={num} 
            data={data[num]} 
            onClick={onToothClick} 
          />
        ))}
      </div>
      <div className="w-1 md:w-2 rounded bg-border h-12 sm:h-16 flex-shrink-0" />
      <div className="flex gap-1 sm:gap-2 justify-start flex-nowrap items-center w-max">
        {rightNumbers.map(num => (
          <Tooth 
            key={num} 
            number={num} 
            data={data[num]} 
            onClick={onToothClick} 
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 items-center w-full max-w-6xl mx-auto p-2">
      
      {/* Upper Felső */}
      <div className="flex flex-col gap-2 w-full items-center">
        {renderRow(ADULT_TEETH.upperRight, ADULT_TEETH.upperLeft)}
        {showBabyTeeth && (
           <div className="mt-2 scale-90 origin-top">
             {renderRow(BABY_TEETH.upperRight, BABY_TEETH.upperLeft)}
           </div>
        )}
      </div>

      <div className="h-1 md:h-2 rounded bg-border w-full max-w-2xl flex-shrink-0" />

      {/* Lower Alsó */}
      <div className="flex flex-col gap-2 w-full items-center">
        {showBabyTeeth && (
           <div className="mb-2 scale-90 origin-bottom">
             {renderRow(BABY_TEETH.lowerRight, BABY_TEETH.lowerLeft)}
           </div>
        )}
        {renderRow(ADULT_TEETH.lowerRight, ADULT_TEETH.lowerLeft)}
      </div>

    </div>
  );
}
